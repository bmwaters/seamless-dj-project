import { useEffect, useRef, useState } from 'react';
import './App.css';
import {
  playAirhorn,
  playApplause,
  playEchoOut,
  playHypeSpins,
  playImpact,
  playScratch,
  playSpinback,
  playVinylStop,
  unlockDjFx,
} from './djFx';
import { useSpotifyPlayer } from './useSpotifyPlayer';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';
const PLAY_CHUNK = 100;
const DEFAULT_CUT_MS = 4000;

let playlistLibraryRequest = null;

function loadPlaylistLibrary() {
  if (!playlistLibraryRequest) {
    playlistLibraryRequest = fetch(`${API_URL}/api/playlists`, {
      credentials: 'include',
    }).then(async (response) => {
      const playlistData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          playlistData.error?.message ||
            playlistData.error ||
            (response.status === 429
              ? 'Spotify is temporarily limiting playlist requests. Please try again shortly.'
              : 'Could not load playlists')
        );
      }
      return playlistData.playlists || [];
    });
  }
  return playlistLibraryRequest;
}

function storageKey(userId) {
  return `seamless-dj-sets-${userId}`;
}

function urisFromSet(sets, index) {
  return (sets?.[index]?.tracks || []).map((track) => track.uri).filter(Boolean);
}

function normalizeSearch(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function playlistMatchesQuery(playlist, query) {
  const words = normalizeSearch(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const haystack = normalizeSearch(
    [playlist.name, playlist.owner, playlist.description].filter(Boolean).join(' ')
  );
  return words.every((word) => haystack.includes(word));
}

function formatTime(ms) {
  if (!ms || ms < 0) {
    return '0:00';
  }
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function IconWave() {
  return (
    <svg className="fx-wave" viewBox="0 0 32 32" aria-hidden="true">
      <rect x="3" y="12" width="2.4" height="8" rx="1.2" />
      <rect x="8" y="8" width="2.4" height="16" rx="1.2" />
      <rect x="13" y="4" width="2.4" height="24" rx="1.2" />
      <rect x="18" y="8" width="2.4" height="16" rx="1.2" />
      <rect x="23" y="11" width="2.4" height="10" rx="1.2" />
      <rect x="28" y="13" width="2.4" height="6" rx="1.2" />
    </svg>
  );
}

function IconPrev() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 6.5 9 12l6.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconNext() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6.5 15 12l-6.5 5.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconPlay() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8.5 6.5v11L18 12z" fill="currentColor" />
    </svg>
  );
}

function IconPause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="6.5" width="3.4" height="11" rx="1" fill="currentColor" />
      <rect x="13.6" y="6.5" width="3.4" height="11" rx="1" fill="currentColor" />
    </svg>
  );
}

function IconFadePause() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 10v4h3l4 3.5V6.5L7 10H4zM14 9.2c.9.7.9 4.9 0 5.6M16.7 7.6c1.7 1.4 1.7 7.4 0 8.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconAnnouncePause() {
  return (
    <svg className="announce-pause-icon" viewBox="0 0 32 32" aria-hidden="true">
      <path
        d="M25.4 14.1a9.2 9.2 0 1 0-14.9 7.05L7.2 26.2l5.15-2.05A9.2 9.2 0 0 0 25.4 14.1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <rect x="11.1" y="11.15" width="9.8" height="2.15" rx="1.07" fill="currentColor" />
      <rect x="11.1" y="16.35" width="9.8" height="2.15" rx="1.07" fill="currentColor" />
    </svg>
  );
}

function IconSliders() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 7h14M5 12h14M5 17h14M9 7V4.8M15 12V9.8M11 17v-2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <circle cx="9" cy="7" r="1.7" fill="currentColor" />
      <circle cx="15" cy="12" r="1.7" fill="currentColor" />
      <circle cx="11" cy="17" r="1.7" fill="currentColor" />
    </svg>
  );
}

function IconTimer() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 13V9.4M10 4.6h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function IconShuffle() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7h3.2c2 0 3.1 1 5.3 5s3.3 5 5.3 5H21M4 17h3.2c.8 0 1.5-.2 2.3-.7M16.8 7H21"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path d="m18.2 4.8 2.8 2.2-2.8 2.2M18.2 14.8 21 17l-2.8 2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [sets, setSets] = useState(null);
  const [openSetId, setOpenSetId] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [playlistQuery, setPlaylistQuery] = useState('');
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [playingFromIndex, setPlayingFromIndex] = useState(null);
  const [fadeEnabled, setFadeEnabled] = useState(() => {
    try {
      return localStorage.getItem('seamless-dj-fade') === 'on';
    } catch {
      return false;
    }
  });
  const [scrubbing, setScrubbing] = useState(false);
  const [scrubPosition, setScrubPosition] = useState(0);
  const [pauseAfterSong, setPauseAfterSong] = useState(false);
  const [holdStatus, setHoldStatus] = useState(null);
  const [shuffleHelpOpen, setShuffleHelpOpen] = useState(false);
  const remainingUris = useRef([]);
  const currentChunk = useRef([]);
  const wasPlaying = useRef(false);
  const playlistPickerRef = useRef(null);
  const setsRef = useRef(sets);
  const playingFromIndexRef = useRef(playingFromIndex);
  const pauseAfterSongRef = useRef(pauseAfterSong);
  const holdStatusRef = useRef(holdStatus);
  setsRef.current = sets;
  playingFromIndexRef.current = playingFromIndex;
  pauseAfterSongRef.current = pauseAfterSong;
  holdStatusRef.current = holdStatus;

  function getSkipAtMs(uri, duration) {
    if (!uri || !duration) {
      return null;
    }
    for (const set of setsRef.current || []) {
      const marked = set.tracks.find((track) => track.uri === uri && track.mixOutMs != null);
      if (marked) {
        return Math.min(marked.mixOutMs, duration - 200);
      }
    }
    return Math.max(0, duration - DEFAULT_CUT_MS);
  }

  function isLastTrackOfCurrentSet(uri) {
    if (!uri || remainingUris.current.length > 0) {
      return false;
    }
    const chunk = currentChunk.current;
    return chunk.length > 0 && chunk[chunk.length - 1] === uri;
  }

  function getHoldMode(uri) {
    if (holdStatusRef.current?.type === 'announcement') {
      return false;
    }
    return pauseAfterSongRef.current || isLastTrackOfCurrentSet(uri);
  }

  function handlePlaybackHold(uri) {
    const wasPauseAfterSong = pauseAfterSongRef.current;
    if (wasPauseAfterSong) {
      setPauseAfterSong(false);
    }
    const index = playingFromIndexRef.current;
    const currentSets = setsRef.current || [];
    if (index != null && isLastTrackOfCurrentSet(uri)) {
      const finished = currentSets[index];
      const next = currentSets[index + 1];
      setHoldStatus({
        type: 'set-ended',
        finishedTitle: finished?.title || 'Set',
        nextTitle: next?.title || null,
      });
      return;
    }
    if (wasPauseAfterSong) {
      setHoldStatus({ type: 'pause-after-song' });
    }
  }

  const {
    deviceId,
    playerState,
    playerError,
    isPaused,
    currentTrack,
    shuffle,
    positionMs,
    durationMs,
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
    fadeOutAndPause,
    resumeFromHold,
    continueAfterSongWait,
  } = useSpotifyPlayer(
    Boolean(user),
    fadeEnabled,
    null,
    getSkipAtMs,
    getHoldMode,
    handlePlaybackHold
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const loginError = params.get('error');
    if (loginError) {
      setError(loginError);
      window.history.replaceState({}, '', window.location.pathname);
    }

    async function loadSession() {
      try {
        const meResponse = await fetch(`${API_URL}/api/me`, {
          credentials: 'include',
        });

        if (meResponse.status === 401) {
          setUser(null);
          setPlaylists([]);
          return;
        }

        if (!meResponse.ok) {
          throw new Error('Could not load Spotify profile');
        }

        const me = await meResponse.json();
        setUser(me);

        const loadedPlaylists = await loadPlaylistLibrary();
        setPlaylists(loadedPlaylists);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    }

    loadSession();
  }, []);

  useEffect(() => {
    if (!user) {
      setSets(null);
      return;
    }

    try {
      const saved = JSON.parse(localStorage.getItem(storageKey(user.id)) || '[]');
      setSets(Array.isArray(saved) ? saved : []);
    } catch {
      setSets([]);
    }
  }, [user]);

  useEffect(() => {
    if (!user || sets === null) {
      return;
    }
    localStorage.setItem(storageKey(user.id), JSON.stringify(sets));
  }, [user, sets]);

  useEffect(() => {
    localStorage.setItem('seamless-dj-fade', fadeEnabled ? 'on' : 'off');
  }, [fadeEnabled]);

  useEffect(() => {
    function closePicker(event) {
      if (playlistPickerRef.current && !playlistPickerRef.current.contains(event.target)) {
        setPlaylistOpen(false);
      }
    }

    document.addEventListener('mousedown', closePicker);
    return () => document.removeEventListener('mousedown', closePicker);
  }, []);

  async function playUris(uris) {
    const response = await fetch(`${API_URL}/api/player/play`, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ deviceId, uris }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Could not start playback');
    }
  }

  async function playChunk() {
    const chunk = remainingUris.current.slice(0, PLAY_CHUNK);
    remainingUris.current = remainingUris.current.slice(PLAY_CHUNK);
    currentChunk.current = chunk;
    if (chunk.length === 0) {
      return;
    }
    await playUris(chunk);
  }

  async function playFromSet(index) {
    await unlockDjFx();
    if (!deviceId) {
      setError('Player is still connecting. Wait a second, then try Play again.');
      return;
    }

    const uris = urisFromSet(sets || [], index);
    if (uris.length === 0) {
      setError('That set has no playable songs yet.');
      return;
    }

    setError(null);
    setHoldStatus(null);
    setPauseAfterSong(false);
    remainingUris.current = uris;
    setPlayingFromIndex(index);
    try {
      await playChunk();
    } catch (playError) {
      setError(playError.message);
    }
  }

  useEffect(() => {
    if (!playerState) {
      return;
    }

    const currentUri = playerState.track_window?.current_track?.uri;
    const lastUri = currentChunk.current[currentChunk.current.length - 1];
    const reachedEnd =
      playerState.paused &&
      wasPlaying.current &&
      currentUri &&
      currentUri === lastUri &&
      playerState.position === 0 &&
      remainingUris.current.length > 0;

    const endedLastOfSet =
      playerState.paused &&
      wasPlaying.current &&
      currentUri &&
      currentUri === lastUri &&
      playerState.position === 0 &&
      remainingUris.current.length === 0 &&
      !holdStatusRef.current;

    wasPlaying.current = !playerState.paused;

    if (reachedEnd) {
      playChunk().catch((playError) => setError(playError.message));
    } else if (endedLastOfSet) {
      handlePlaybackHold(currentUri);
    }
    // playChunk is stable enough via refs; we only want this on player state ticks
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerState]);

  async function addPlaylist(playlist) {
    setError(null);
    setAddingId(playlist.id);

    try {
      const response = await fetch(`${API_URL}/api/playlists/${playlist.id}/tracks`, {
        credentials: 'include',
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error?.message || data.error || 'Could not load tracks');
      }

      const nextSet = {
        id: crypto.randomUUID(),
        title: playlist.name,
        spotifyPlaylistId: playlist.id,
        image: playlist.image,
        tracks: data.tracks || [],
      };

      setSets((current) => [...(current || []), nextSet]);
      setOpenSetId(nextSet.id);
      setPlaylistQuery('');
      setPlaylistOpen(false);
    } catch (addError) {
      setError(addError.message);
    } finally {
      setAddingId(null);
    }
  }

  function renameSet(id, title) {
    setSets((current) =>
      (current || []).map((set) => (set.id === id ? { ...set, title } : set))
    );
  }

  function removeSet(id) {
    setSets((current) => (current || []).filter((set) => set.id !== id));
    if (openSetId === id) {
      setOpenSetId(null);
    }
  }

  function moveSet(index, direction) {
    setSets((current) => {
      const next = [...(current || [])];
      const target = index + direction;
      if (target < 0 || target >= next.length) {
        return current;
      }
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  }

  function currentMixOutMs() {
    const uri = currentTrack?.uri;
    if (!uri) {
      return null;
    }
    for (const set of sets || []) {
      const track = set.tracks.find((item) => item.uri === uri);
      if (track?.mixOutMs != null) {
        return track.mixOutMs;
      }
    }
    return null;
  }

  function updateCurrentMixOut(mixOutMs) {
    const uri = currentTrack?.uri;
    if (!uri) {
      return;
    }
    setSets((current) =>
      (current || []).map((set) => ({
        ...set,
        tracks: set.tracks.map((track) =>
          track.uri === uri ? { ...track, mixOutMs } : track
        ),
      }))
    );
  }

  function markMixOut() {
    const position = scrubbing ? scrubPosition : positionMs;
    if (!currentTrack || !durationMs) {
      return;
    }
    updateCurrentMixOut(Math.max(2000, Math.min(position, durationMs - 200)));
  }

  function clearMixOut() {
    updateCurrentMixOut(undefined);
  }

  async function onSeekCommit(value) {
    setScrubbing(false);
    try {
      await seek(value);
    } catch (seekError) {
      setError(seekError.message);
    }
  }

  async function onPlayPauseClick() {
    await unlockDjFx();
    if (holdStatus?.type === 'announcement') {
      try {
        await resumeFromHold();
        setHoldStatus(null);
      } catch (playError) {
        setError(playError.message);
      }
      return;
    }
    if (holdStatus?.type === 'pause-after-song') {
      try {
        await continueAfterSongWait();
        setHoldStatus(null);
      } catch (playError) {
        setError(playError.message);
      }
      return;
    }
    if (holdStatus?.type === 'set-ended') {
      setError(
        holdStatus.nextTitle
          ? `${holdStatus.finishedTitle} finished. Press Play on ${holdStatus.nextTitle} when you are ready.`
          : `${holdStatus.finishedTitle} finished.`
      );
      return;
    }
    if (isPaused && !currentTrack && (sets || []).some((set) => set.tracks.length > 0)) {
      await playFromSet(0);
      return;
    }
    try {
      await togglePlay();
    } catch (playError) {
      setError(playError.message);
    }
  }

  async function onFadePauseNow() {
    await unlockDjFx();
    try {
      setPauseAfterSong(false);
      await fadeOutAndPause();
      setHoldStatus({ type: 'announcement' });
    } catch (playError) {
      setError(playError.message);
    }
  }

  function onPauseAfterSong() {
    setPauseAfterSong((armed) => !armed);
  }

  function waitMessage() {
    if (holdStatus?.type === 'announcement') {
      return 'Waiting for announcement — press Play to resume.';
    }
    if (holdStatus?.type === 'pause-after-song') {
      return 'Waiting after song — press Play to continue.';
    }
    if (holdStatus?.type === 'set-ended') {
      return holdStatus.nextTitle
        ? `${holdStatus.finishedTitle} finished. Play ${holdStatus.nextTitle} when ready.`
        : `${holdStatus.finishedTitle} finished.`;
    }
    return null;
  }

  const shuffleTooltip = shuffle
    ? 'Spotify Shuffle: On. Shuffle may change the intended Event Flow playback order.'
    : 'Spotify Shuffle: Off';

  const hasSongs = (sets || []).some((set) => set.tracks.length > 0);
  const nowPlayingName = currentTrack?.name;
  const nowPlayingArtists = (currentTrack?.artists || []).map((artist) => artist.name).join(', ');
  const mixOutMs = currentMixOutMs();
  const albumArt =
    currentTrack?.album?.images?.[0]?.url ||
    currentTrack?.album?.images?.[1]?.url ||
    null;
  const playlistMatches = playlists.filter((playlist) =>
    playlistMatchesQuery(playlist, playlistQuery)
  );
  const showPlaylistMenu =
    playlistOpen && playlists.length > 0;

  return (
    <div className="app">
      <header className="header">
        <h1>Seamless DJ</h1>
        {user ? (
          <div className="user">
            <span>{user.displayName || user.id}</span>
            <a href={`${API_URL}/logout`}>Log out</a>
          </div>
        ) : (
          <a className="login" href={`${API_URL}/login`}>
            Log in with Spotify
          </a>
        )}
      </header>

      {user && (
        <div className="player-bar">
          <div className={`player-art${albumArt ? '' : ' empty'}`}>
            {albumArt ? <img src={albumArt} alt="" /> : null}
          </div>
          <div className="now-playing">
            {nowPlayingName ? (
              <>
                <strong>{nowPlayingName}</strong>
                <span>{nowPlayingArtists}</span>
              </>
            ) : (
              <span>{deviceId ? 'Ready to play' : 'Connecting player…'}</span>
            )}
          </div>
          <div className="seek">
            <span>{formatTime(scrubbing ? scrubPosition : positionMs)}</span>
            <input
              type="range"
              min="0"
              max={durationMs || 0}
              value={scrubbing ? scrubPosition : Math.min(positionMs, durationMs || 0)}
              disabled={!currentTrack || !durationMs}
              aria-label="Song position"
              onChange={(event) => {
                setScrubbing(true);
                setScrubPosition(Number(event.target.value));
              }}
              onMouseUp={(event) => onSeekCommit(Number(event.target.value))}
              onTouchEnd={(event) => onSeekCommit(Number(event.target.value))}
              onKeyUp={(event) => onSeekCommit(Number(event.target.value))}
            />
            <span>{formatTime(durationMs)}</span>
          </div>
          <div className="player-controls">
            <button
              type="button"
              className="transport skip-btn"
              disabled={!deviceId || !currentTrack}
              onClick={previousTrack}
              aria-label="Previous"
            >
              <IconPrev />
            </button>
            <button
              type="button"
              className="play-main"
              disabled={!deviceId || !hasSongs}
              onClick={onPlayPauseClick}
              aria-label={isPaused ? 'Play' : 'Pause'}
            >
              {isPaused ? <IconPlay /> : <IconPause />}
            </button>
            <button
              type="button"
              className="transport skip-btn"
              disabled={!deviceId || !currentTrack}
              onClick={nextTrack}
              aria-label="Skip"
            >
              <IconNext />
            </button>
          </div>
        </div>
      )}

      {user && (
        <div className="event-controls">
          <button
            type="button"
            className="event-card event-fade"
            disabled={!deviceId || !currentTrack || isPaused}
            onClick={onFadePauseNow}
          >
            <IconFadePause />
            <span>Fade + Pause</span>
          </button>
          <button
            type="button"
            className={`event-card event-announce${pauseAfterSong ? ' armed' : ''}`}
            disabled={!deviceId || !currentTrack}
            onClick={onPauseAfterSong}
          >
            <IconAnnouncePause />
            <span>Pause After Song</span>
          </button>
          <button
            type="button"
            className="event-card event-mixout"
            disabled={!currentTrack || !durationMs}
            onClick={mixOutMs == null ? markMixOut : clearMixOut}
          >
            <IconSliders />
            <span>
              {mixOutMs == null ? 'Set Mix-Out' : `Clear mix-out (${formatTime(mixOutMs)})`}
            </span>
          </button>
          <label className={`event-card event-tight fade-toggle${fadeEnabled ? ' on' : ''}`}>
            <IconTimer />
            <span>Tight Mix</span>
            <input
              type="checkbox"
              checked={fadeEnabled}
              onChange={(event) => setFadeEnabled(event.target.checked)}
            />
            <span className="fade-switch" aria-hidden="true" />
          </label>
          <button
            type="button"
            className={`event-card event-shuffle${shuffle ? ' on' : ''}`}
            title={shuffleTooltip}
            aria-label={shuffleTooltip}
            aria-expanded={shuffleHelpOpen}
            onClick={() => setShuffleHelpOpen((open) => !open)}
          >
            <IconShuffle />
            <span className="shuffle-copy">
              <strong>Shuffle</strong>
              <em>{shuffle ? 'On' : 'Off'}</em>
            </span>
          </button>
        </div>
      )}
      {user && waitMessage() && (
        <p className="event-wait">{waitMessage()}</p>
      )}

      {user && (
        <div className="fx-pads">
          <div className="fx-pad-cell">
            <span>Scratch</span>
            <button type="button" className="fx-pad fx-scratch" onClick={playScratch} aria-label="Scratch">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Spinback</span>
            <button type="button" className="fx-pad fx-spinback" onClick={playSpinback} aria-label="Spinback">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Hype</span>
            <button type="button" className="fx-pad fx-hype" onClick={playHypeSpins} aria-label="Hype">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Applause</span>
            <button type="button" className="fx-pad fx-applause" onClick={playApplause} aria-label="Applause">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Air horn</span>
            <button type="button" className="fx-pad fx-airhorn" onClick={playAirhorn} aria-label="Air horn">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Vinyl stop</span>
            <button type="button" className="fx-pad fx-vinyl" onClick={playVinylStop} aria-label="Vinyl stop">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Impact</span>
            <button type="button" className="fx-pad fx-impact" onClick={playImpact} aria-label="Impact">
              <IconWave />
            </button>
          </div>
          <div className="fx-pad-cell">
            <span>Echo out</span>
            <button type="button" className="fx-pad fx-echo" onClick={playEchoOut} aria-label="Echo out">
              <IconWave />
            </button>
          </div>
        </div>
      )}

      {user?.product && user.product !== 'premium' && (
        <p className="error">Spotify Premium is required to play music in this browser.</p>
      )}

      {(error || playerError) && <p className="error">{error || playerError}</p>}

      {loading && <p>Loading…</p>}

      {!loading && !user && (
        <p>Log in to pull your Spotify playlists into a day’s run-of-show.</p>
      )}

      {user && sets !== null && (
        <div className="layout">
          <section>
            <div className="section-heading">
              <h2>Event Flow</h2>
              <div className="playlist-picker" ref={playlistPickerRef}>
              <div className="playlist-search">
              <IconSearch />
              <input
                type="text"
                autoComplete="off"
                spellCheck="false"
                placeholder="Search playlists by name"
                value={playlistQuery}
                disabled={playlists.length === 0}
                onChange={(event) => {
                  setPlaylistQuery(event.target.value);
                  setPlaylistOpen(true);
                }}
                onFocus={() => setPlaylistOpen(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    setPlaylistOpen(false);
                  }
                }}
                aria-label="Search Spotify playlists"
              />
              </div>
              {playlists.length === 0 && !error && (
                <p className="hint">No playlists found on this account.</p>
              )}
              {playlists.length === 0 && error && (
                <p className="hint">Playlist search couldn’t load. Refresh and try again.</p>
              )}
              {showPlaylistMenu && (
                <ul className="playlists playlist-dropdown">
                  {playlistMatches.length === 0 ? (
                    <li className="playlist-empty">No playlists match those words.</li>
                  ) : (
                    playlistMatches.map((playlist) => (
                      <li key={playlist.id}>
                        {playlist.image && (
                          <img src={playlist.image} alt="" width="40" height="40" />
                        )}
                        <div>
                          <strong>{playlist.name}</strong>
                          <span>
                            {playlist.mine ? 'Yours' : playlist.owner || 'Followed'}
                            {playlist.trackCount != null ? ` · ${playlist.trackCount} tracks` : ''}
                          </span>
                        </div>
                        <button
                          type="button"
                          disabled={addingId === playlist.id}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => addPlaylist(playlist)}
                        >
                          {addingId === playlist.id ? 'Adding…' : 'Add'}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              )}
              </div>
            </div>
            {sets.length === 0 ? (
              <p className="hint">Search a playlist to stack sets for the event. You can rename each one.</p>
            ) : (
              <ol className="sets">
                {sets.map((set, index) => (
                  <li
                    key={set.id}
                    className={`set${playingFromIndex === index ? ' set-active' : ''}`}
                  >
                    <div className="set-row">
                      {set.image && (
                        <img src={set.image} alt="" width="52" height="52" />
                      )}
                      <input
                        aria-label="Set title"
                        value={set.title}
                        onChange={(event) => renameSet(set.id, event.target.value)}
                      />
                      <span className="meta">{set.tracks.length} tracks</span>
                      <div className="set-actions">
                        <button
                          type="button"
                          className="play-set"
                          disabled={!deviceId || set.tracks.length === 0}
                          onClick={() => playFromSet(index)}
                        >
                          Play
                        </button>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveSet(index, -1)}
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={index === sets.length - 1}
                          onClick={() => moveSet(index, 1)}
                        >
                          Down
                        </button>
                        <button type="button" onClick={() => removeSet(set.id)}>
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setOpenSetId(openSetId === set.id ? null : set.id)
                          }
                        >
                          {openSetId === set.id ? 'Hide songs' : 'Songs'}
                        </button>
                      </div>
                    </div>
                    {openSetId === set.id && (
                      <ul className="tracks">
                        {set.tracks.length === 0 ? (
                          <li>No playable tracks in this playlist.</li>
                        ) : (
                          set.tracks.map((track, trackIndex) => (
                            <li
                              key={`${track.uri}-${trackIndex}`}
                              className={
                                currentTrack?.uri === track.uri ? 'track-current' : ''
                              }
                            >
                              {trackIndex + 1}. {track.name}
                              {track.artists ? ` — ${track.artists}` : ''}
                              {track.mixOutMs != null ? ` (mix-out ${formatTime(track.mixOutMs)})` : ''}
                            </li>
                          ))
                        )}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
