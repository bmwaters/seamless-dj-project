import { useEffect, useRef, useState } from 'react';
import './App.css';
import {
  playAirhorn,
  playApplause,
  playChime,
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

function urisFromSets(sets, fromIndex) {
  return sets
    .slice(fromIndex)
    .flatMap((set) => set.tracks.map((track) => track.uri))
    .filter(Boolean);
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
  const remainingUris = useRef([]);
  const currentChunk = useRef([]);
  const wasPlaying = useRef(false);
  const playlistPickerRef = useRef(null);
  const setsRef = useRef(sets);
  setsRef.current = sets;

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

  const {
    deviceId,
    playerState,
    playerError,
    isPaused,
    currentTrack,
    positionMs,
    durationMs,
    togglePlay,
    nextTrack,
    previousTrack,
    seek,
  } = useSpotifyPlayer(Boolean(user), fadeEnabled, null, getSkipAtMs);

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

    const uris = urisFromSets(sets || [], index);
    if (uris.length === 0) {
      setError('That set has no playable songs yet.');
      return;
    }

    setError(null);
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

    wasPlaying.current = !playerState.paused;

    if (reachedEnd) {
      playChunk().catch((playError) => setError(playError.message));
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

  const hasSongs = (sets || []).some((set) => set.tracks.length > 0);
  const nowPlayingName = currentTrack?.name;
  const nowPlayingArtists = (currentTrack?.artists || []).map((artist) => artist.name).join(', ');
  const mixOutMs = currentMixOutMs();
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
            <button
              type="button"
              className="fx-btn"
              disabled={!currentTrack || !durationMs}
              onClick={mixOutMs == null ? markMixOut : clearMixOut}
            >
              {mixOutMs == null ? 'Set mix-out' : `Clear mix-out (${formatTime(mixOutMs)})`}
            </button>
          </div>
          <div className="player-controls">
            <label className={`fade-toggle${fadeEnabled ? ' on' : ''}`}>
              <input
                type="checkbox"
                checked={fadeEnabled}
                onChange={(event) => setFadeEnabled(event.target.checked)}
              />
              <span className="fade-switch" aria-hidden="true" />
              Tight mix
            </label>
            <button
              type="button"
              disabled={!deviceId || !currentTrack}
              onClick={previousTrack}
            >
              Previous
            </button>
            <button
              type="button"
              className="play-main"
              disabled={!deviceId || !hasSongs}
              onClick={onPlayPauseClick}
            >
              {isPaused ? 'Play' : 'Pause'}
            </button>
            <button type="button" disabled={!deviceId || !currentTrack} onClick={nextTrack}>
              Skip
            </button>
          </div>
        </div>
      )}

      {user && (
        <div className="fx-pads">
          <div className="fx-pad-cell">
            <span>Scratch</span>
            <button type="button" className="fx-pad fx-scratch" onClick={playScratch} aria-label="Scratch" />
          </div>
          <div className="fx-pad-cell">
            <span>Spinback</span>
            <button type="button" className="fx-pad fx-spinback" onClick={playSpinback} aria-label="Spinback" />
          </div>
          <div className="fx-pad-cell">
            <span>Hype</span>
            <button type="button" className="fx-pad fx-hype" onClick={playHypeSpins} aria-label="Hype" />
          </div>
          <div className="fx-pad-cell">
            <span>Applause</span>
            <button type="button" className="fx-pad fx-applause" onClick={playApplause} aria-label="Applause" />
          </div>
          <div className="fx-pad-cell">
            <span>Air horn</span>
            <button type="button" className="fx-pad fx-airhorn" onClick={playAirhorn} aria-label="Air horn" />
          </div>
          <div className="fx-pad-cell">
            <span>Vinyl stop</span>
            <button type="button" className="fx-pad fx-vinyl" onClick={playVinylStop} aria-label="Vinyl stop" />
          </div>
          <div className="fx-pad-cell">
            <span>Chime</span>
            <button type="button" className="fx-pad fx-chime" onClick={playChime} aria-label="Chime" />
          </div>
          <div className="fx-pad-cell">
            <span>Impact</span>
            <button type="button" className="fx-pad fx-impact" onClick={playImpact} aria-label="Impact" />
          </div>
          <div className="fx-pad-cell">
            <span>Echo out</span>
            <button type="button" className="fx-pad fx-echo" onClick={playEchoOut} aria-label="Echo out" />
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
                        <img src={set.image} alt="" width="48" height="48" />
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
