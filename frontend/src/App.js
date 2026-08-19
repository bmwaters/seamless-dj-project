import { useEffect, useState } from 'react';
import './App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://127.0.0.1:5050';

function storageKey(userId) {
  return `seamless-dj-sets-${userId}`;
}

function App() {
  const [user, setUser] = useState(null);
  const [playlists, setPlaylists] = useState([]);
  const [sets, setSets] = useState(null);
  const [openSetId, setOpenSetId] = useState(null);
  const [addingId, setAddingId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

        const playlistResponse = await fetch(`${API_URL}/api/playlists`, {
          credentials: 'include',
        });
        if (!playlistResponse.ok) {
          throw new Error('Could not load playlists');
        }

        const data = await playlistResponse.json();
        setPlaylists(data.playlists || []);
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

      {error && <p className="error">{error}</p>}

      {loading && <p>Loading…</p>}

      {!loading && !user && (
        <p>Log in to pull your Spotify playlists into a day’s run-of-show.</p>
      )}

      {user && sets !== null && (
        <div className="layout">
          <section>
            <h2>Today’s run-of-show</h2>
            {sets.length === 0 ? (
              <p className="hint">Click Add on a playlist to stack sets for the day. You can rename each one.</p>
            ) : (
              <ol className="sets">
                {sets.map((set, index) => (
                  <li key={set.id} className="set">
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
                            <li key={`${track.uri}-${trackIndex}`}>
                              {trackIndex + 1}. {track.name}
                              {track.artists ? ` — ${track.artists}` : ''}
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

          <section>
            <h2>Your Spotify playlists</h2>
            {playlists.length === 0 ? (
              <p>No playlists found on this account.</p>
            ) : (
              <ul className="playlists">
                {playlists.map((playlist) => (
                  <li key={playlist.id}>
                    {playlist.image && (
                      <img src={playlist.image} alt="" width="48" height="48" />
                    )}
                    <div>
                      <strong>{playlist.name}</strong>
                      <span>{playlist.owner ? playlist.owner : 'Spotify playlist'}</span>
                    </div>
                    <button
                      type="button"
                      disabled={addingId === playlist.id}
                      onClick={() => addPlaylist(playlist)}
                    >
                      {addingId === playlist.id ? 'Adding…' : 'Add'}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
