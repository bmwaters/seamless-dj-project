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

export function useSpotifyPlayer(enabled) {
  const [deviceId, setDeviceId] = useState(null);
  const [playerState, setPlayerState] = useState(null);
  const [playerError, setPlayerError] = useState(null);
  const playerRef = useRef(null);

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
      player.addListener('player_state_changed', (state) => setPlayerState(state));
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
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, [enabled]);

  async function togglePlay() {
    await playerRef.current?.togglePlay();
  }

  async function nextTrack() {
    await playerRef.current?.nextTrack();
  }

  return {
    deviceId,
    playerState,
    playerError,
    isPaused: playerState?.paused !== false,
    currentTrack: playerState?.track_window?.current_track || null,
    togglePlay,
    nextTrack,
  };
}
