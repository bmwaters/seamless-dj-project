import { useEffect, useRef, useState } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';
const SDK_URL = 'https://sdk.scdn.co/spotify-player.js';

async function fetchAccessToken() {
  const response = await fetch(`${API_URL}/api/token`, { credentials: 'include' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Could not get Spotify token');
  }
  return data.accessToken;
}

function loadSdkScript() {
  if (document.querySelector(`script[src="${SDK_URL}"]`)) {
    return;
  }
  const script = document.createElement('script');
  script.src = SDK_URL;
  script.async = true;
  document.body.appendChild(script);
}

function durationOf(state) {
  return state?.duration || state?.track_window?.current_track?.duration_ms || 0;
}

export function useSpotifyPlayer(enabled, fadeEnabled = false, onFadeTransition, getSkipAtMs) {
  const [deviceId, setDeviceId] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [playerError, setPlayerError] = useState(null);
  const [positionMs, setPositionMs] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const playerRef = useRef(null);
  const fadeEnabledRef = useRef(fadeEnabled);
  const lastUri = useRef(null);
  const skippingOutro = useRef(false);
  const pendingFadeIn = useRef(false);
  const lastTick = useRef({ position: 0, at: 0, duration: 0 });
  const lastFadeVolume = useRef(1);
  const fadeToken = useRef(0);
  const onFadeTransitionRef = useRef(onFadeTransition);
  const getSkipAtMsRef = useRef(getSkipAtMs);

  fadeEnabledRef.current = fadeEnabled;
  onFadeTransitionRef.current = onFadeTransition;
  getSkipAtMsRef.current = getSkipAtMs;

  async function restoreVolume() {
    fadeToken.current += 1;
    skippingOutro.current = false;
    pendingFadeIn.current = false;
    lastFadeVolume.current = 1;
    await playerRef.current?.setVolume(1);
  }

  async function fadeInVolume(player) {
    const token = fadeToken.current + 1;
    fadeToken.current = token;
    lastFadeVolume.current = 0.08;
    await player.setVolume(0.08);
    const steps = 10;
    for (let i = 1; i <= steps; i += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 90));
      if (token !== fadeToken.current) {
        return;
      }
      const volume = 0.08 + (0.92 * i) / steps;
      lastFadeVolume.current = volume;
      await player.setVolume(volume);
    }
  }

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    let cancelled = false;

    function connectPlayer() {
      if (cancelled || playerRef.current || !window.Spotify) {
        return;
      }

      const player = new window.Spotify.Player({
        name: 'Seamless DJ',
        getOAuthToken: (callback) => {
          fetchAccessToken()
            .then(callback)
            .catch((error) => setPlayerError(error.message));
        },
        volume: 1,
      });

      player.addListener('ready', ({ device_id }) => {
        setDeviceId(device_id);
        setPlayerError(null);
      });
      player.addListener('not_ready', () => setDeviceId(null));
      player.addListener('player_state_changed', (state) => {
        setPlayerState(state);
        if (state) {
          setPositionMs(state.position || 0);
          setDurationMs(durationOf(state));
        }
      });
      player.addListener('initialization_error', ({ message }) => setPlayerError(message));
      player.addListener('authentication_error', ({ message }) =>
        setPlayerError(
          `${message}. Log out and log in again so Spotify can allow playback.`
        )
      );
      player.addListener('account_error', ({ message }) => setPlayerError(message));

      player.connect();
      playerRef.current = player;
    }

    loadSdkScript();

    if (window.Spotify) {
      connectPlayer();
    } else {
      const previous = window.onSpotifyWebPlaybackSDKReady;
      window.onSpotifyWebPlaybackSDKReady = () => {
        if (typeof previous === 'function') {
          previous();
        }
        connectPlayer();
      };
    }

    return () => {
      cancelled = true;
      skippingOutro.current = false;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [enabled]);

  useEffect(() => {
    if (!fadeEnabled) {
      restoreVolume();
    }
  }, [fadeEnabled]);

  useEffect(() => {
    if (!deviceId) {
      return undefined;
    }

    const interval = setInterval(async () => {
      const player = playerRef.current;
      const state = await player?.getCurrentState();
      if (!state) {
        return;
      }

      const duration = durationOf(state);
      const uri = state.track_window?.current_track?.uri || null;
      const now = Date.now();
      let position = state.position || 0;

      if (
        !state.paused &&
        uri === lastUri.current &&
        lastTick.current.at &&
        state.position === lastTick.current.position
      ) {
        position = Math.min(duration, lastTick.current.position + (now - lastTick.current.at));
      }

      lastTick.current = { position: state.position || 0, at: now, duration };
      setPlayerState(state);
      setPositionMs(position);
      setDurationMs(duration);

      if (uri && uri !== lastUri.current) {
        lastUri.current = uri;
        lastTick.current = { position: state.position || 0, at: now, duration };
        if (pendingFadeIn.current && fadeEnabledRef.current) {
          pendingFadeIn.current = false;
          skippingOutro.current = false;
          await fadeInVolume(player);
        } else {
          pendingFadeIn.current = false;
          skippingOutro.current = false;
          lastFadeVolume.current = 1;
          await player.setVolume(1);
        }
        return;
      }

      if (uri && lastUri.current === null) {
        lastUri.current = uri;
      }

      if (!fadeEnabledRef.current || skippingOutro.current || state.paused) {
        return;
      }

      const skipAt = getSkipAtMsRef.current?.(uri, duration);
      if (skipAt == null || skipAt < 2000 || duration - skipAt < 80) {
        return;
      }

      const fadeMs = 1400;
      const fadeStart = Math.max(0, skipAt - fadeMs);

      if (position >= skipAt) {
        skippingOutro.current = true;
        pendingFadeIn.current = true;
        lastFadeVolume.current = 0.05;
        await player.setVolume(0.05);
        await player.nextTrack();
        return;
      }

      if (position >= fadeStart && skipAt > fadeStart) {
        const progress = (position - fadeStart) / (skipAt - fadeStart);
        const volume = Math.max(0.05, 1 - progress);
        if (Math.abs(volume - lastFadeVolume.current) >= 0.04) {
          lastFadeVolume.current = volume;
          await player.setVolume(volume);
        }
      }
    }, 50);

    return () => clearInterval(interval);
  }, [deviceId]);

  async function togglePlay() {
    await playerRef.current?.togglePlay();
  }

  async function nextTrack() {
    await restoreVolume();
    await playerRef.current?.nextTrack();
  }

  async function previousTrack() {
    await restoreVolume();
    await playerRef.current?.previousTrack();
  }

  async function seek(positionMsValue) {
    await restoreVolume();
    await playerRef.current?.seek(positionMsValue);
  }

  return {
    deviceId,
    playerState,
    playerError,
    isPaused: playerState?.paused !== false,
    currentTrack: playerState?.track_window?.current_track || null,
    positionMs,
    durationMs,
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
  };
}
