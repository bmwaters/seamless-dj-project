require('dotenv').config();

const express = require('express');
const cors = require('cors');
const session = require('express-session');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5050;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:3000';
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const SPOTIFY_REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI;
const SPOTIFY_SCOPES = [
  'user-read-email',
  'user-read-private',
  'playlist-read-private',
  'playlist-read-collaborative',
  'streaming',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

const allowedOrigins = [
  FRONTEND_URL,
  'http://127.0.0.1:3000',
  'http://localhost:3000',
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 24 * 60 * 60 * 1000,
    },
  })
);

function requireSpotifyConfig(res) {
  if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REDIRECT_URI) {
    res.status(500).json({
      error:
        'Spotify is not configured. Add SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET, and SPOTIFY_REDIRECT_URI to backend/.env',
    });
    return false;
  }
  return true;
}

function basicAuthHeader() {
  return (
    'Basic ' +
    Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64')
  );
}

async function exchangeSpotifyToken(body) {
  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: basicAuthHeader(),
    },
    body,
  });

  const data = await response.json();
  if (!response.ok) {
    const message = data.error_description || data.error || 'Spotify token request failed';
    throw new Error(message);
  }
  return data;
}

function storeTokens(req, tokenResponse) {
  req.session.tokens = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || req.session.tokens?.refresh_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  };
}

async function getAccessToken(req) {
  const tokens = req.session.tokens;
  if (!tokens?.access_token) {
    return null;
  }

  if (Date.now() < tokens.expiresAt - 60 * 1000) {
    return tokens.access_token;
  }

  if (!tokens.refresh_token) {
    return null;
  }

  const refreshed = await exchangeSpotifyToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    })
  );
  storeTokens(req, refreshed);
  return req.session.tokens.access_token;
}

async function requireAuth(req, res, next) {
  try {
    const accessToken = await getAccessToken(req);
    if (!accessToken) {
      res.status(401).json({ error: 'Not logged in' });
      return;
    }
    req.accessToken = accessToken;
    next();
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

async function playlistLastAddedAt(accessToken, playlistId, trackCount) {
  if (!playlistId || !trackCount) {
    return null;
  }

  const limit = Math.min(20, trackCount);
  const offset = Math.max(0, trackCount - limit);
  const params = new URLSearchParams({
    limit: String(limit),
    offset: String(offset),
    fields: 'items(added_at)',
  });
  const response = await fetch(
    `https://api.spotify.com/v1/playlists/${playlistId}/items?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  let latest = null;
  for (const item of data.items || []) {
    if (item?.added_at && (!latest || item.added_at > latest)) {
      latest = item.added_at;
    }
  }
  return latest;
}

app.get('/', (req, res) => {
  res.send('Seamless DJ Project Backend Running');
});

app.get('/login', (req, res) => {
  if (!requireSpotifyConfig(res)) {
    return;
  }

  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    scope: SPOTIFY_SCOPES,
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    show_dialog: 'false',
  });

  req.session.save((err) => {
    if (err) {
      res.status(500).send('Could not start Spotify login');
      return;
    }
    res.redirect(`https://accounts.spotify.com/authorize?${params.toString()}`);
  });
});

app.get('/callback', async (req, res) => {
  try {
    if (!requireSpotifyConfig(res)) {
      return;
    }

    const { code, state, error } = req.query;
    if (error) {
      res.redirect(`${FRONTEND_URL}?error=${encodeURIComponent(String(error))}`);
      return;
    }

    if (!code || !state || state !== req.session.oauthState) {
      res.redirect(`${FRONTEND_URL}?error=invalid_state`);
      return;
    }

    req.session.oauthState = undefined;

    const tokenResponse = await exchangeSpotifyToken(
      new URLSearchParams({
        grant_type: 'authorization_code',
        code: String(code),
        redirect_uri: SPOTIFY_REDIRECT_URI,
      })
    );

    storeTokens(req, tokenResponse);
    req.session.save((err) => {
      if (err) {
        res.redirect(`${FRONTEND_URL}?error=session`);
        return;
      }
      res.redirect(FRONTEND_URL);
    });
  } catch (error) {
    res.redirect(`${FRONTEND_URL}?error=${encodeURIComponent(error.message)}`);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect(FRONTEND_URL);
  });
});

app.get('/api/me', requireAuth, async (req, res) => {
  try {
    const response = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    const data = await response.json();
    if (!response.ok) {
      res.status(response.status).json(data);
      return;
    }

    res.json({
      id: data.id,
      displayName: data.display_name,
      email: data.email,
      product: data.product,
      image: data.images?.[0]?.url || null,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/playlists', requireAuth, async (req, res) => {
  try {
    const meResponse = await fetch('https://api.spotify.com/v1/me', {
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });
    const me = await meResponse.json();
    if (!meResponse.ok) {
      res.status(meResponse.status).json(me);
      return;
    }

    const playlists = [];
    let url = 'https://api.spotify.com/v1/me/playlists?limit=50';

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${req.accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        res.status(response.status).json(data);
        return;
      }

      for (const playlist of data.items || []) {
        if (!playlist?.id) {
          continue;
        }
        playlists.push({
          id: playlist.id,
          name: playlist.name || 'Untitled playlist',
          description: playlist.description || '',
          trackCount: playlist.items?.total ?? playlist.tracks?.total ?? 0,
          image: playlist.images?.[0]?.url || null,
          owner: playlist.owner?.display_name || playlist.owner?.id || '',
          ownerId: playlist.owner?.id || null,
          mine: playlist.owner?.id === me.id,
          lastAddedAt: null,
        });
      }

      url = data.next;
    }

    const owned = playlists.filter((playlist) => playlist.mine && playlist.trackCount > 0);
    await mapLimit(owned, 6, async (playlist) => {
      playlist.lastAddedAt = await playlistLastAddedAt(
        req.accessToken,
        playlist.id,
        playlist.trackCount
      );
    });

    playlists.sort((a, b) => {
      if (a.mine !== b.mine) {
        return a.mine ? -1 : 1;
      }
      if (a.lastAddedAt !== b.lastAddedAt) {
        if (!a.lastAddedAt) {
          return 1;
        }
        if (!b.lastAddedAt) {
          return -1;
        }
        return a.lastAddedAt < b.lastAddedAt ? 1 : -1;
      }
      return a.name.localeCompare(b.name);
    });

    res.json({ playlists });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/playlists/:id/tracks', requireAuth, async (req, res) => {
  try {
    const playlistId = req.params.id;
    if (!/^[A-Za-z0-9]+$/.test(playlistId)) {
      res.status(400).json({ error: 'Invalid playlist id' });
      return;
    }

    const tracks = [];
    let url = `https://api.spotify.com/v1/playlists/${playlistId}/items?limit=100`;

    while (url) {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${req.accessToken}` },
      });
      const data = await response.json();
      if (!response.ok) {
        const message =
          data.error?.message || data.error || 'Could not load playlist tracks from Spotify';
        console.error('Spotify tracks error:', response.status, message, data);
        res.status(response.status).json({ error: message });
        return;
      }

      for (const entry of data.items || []) {
        const track = entry.item || entry.track;
        if (!track?.uri) {
          continue;
        }
        tracks.push({
          id: track.id,
          uri: track.uri,
          name: track.name,
          artists: (track.artists || []).map((artist) => artist.name).join(', '),
          durationMs: track.duration_ms,
          image: track.album?.images?.[track.album.images.length - 1]?.url || null,
        });
      }

      url = data.next;
    }

    res.json({ tracks });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

function spotifyErrorMessage(data, fallback) {
  return data.error?.message || data.error || fallback;
}

app.get('/api/token', requireAuth, (req, res) => {
  res.json({ accessToken: req.accessToken });
});

app.put('/api/player/play', requireAuth, async (req, res) => {
  try {
    const { deviceId, uris } = req.body || {};
    if (!deviceId || !Array.isArray(uris) || uris.length === 0) {
      res.status(400).json({ error: 'A device and at least one song are required' });
      return;
    }

    const limited = uris.filter((uri) => typeof uri === 'string').slice(0, 100);
    const headers = {
      Authorization: `Bearer ${req.accessToken}`,
      'Content-Type': 'application/json',
    };

    await fetch('https://api.spotify.com/v1/me/player', {
      method: 'PUT',
      headers,
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
    });

    await new Promise((resolve) => setTimeout(resolve, 400));

    const response = await fetch(
      `https://api.spotify.com/v1/me/player/play?device_id=${encodeURIComponent(deviceId)}`,
      {
        method: 'PUT',
        headers,
        body: JSON.stringify({ uris: limited }),
      }
    );

    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      const message = spotifyErrorMessage(data, 'Could not start playback');
      console.error('Spotify play error:', response.status, message, data);
      res.status(response.status).json({ error: message });
      return;
    }

    res.json({ ok: true, queued: limited.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/player/pause', requireAuth, async (req, res) => {
  try {
    const deviceId = req.body?.deviceId;
    const query = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
    const response = await fetch(`https://api.spotify.com/v1/me/player/pause${query}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${req.accessToken}` },
    });

    if (!response.ok && response.status !== 204) {
      const data = await response.json().catch(() => ({}));
      res.status(response.status).json({ error: spotifyErrorMessage(data, 'Could not pause') });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`Server running on http://127.0.0.1:${PORT}`);
  if (!SPOTIFY_CLIENT_SECRET) {
    console.warn('Missing SPOTIFY_CLIENT_SECRET in backend/.env — login will not work until you add it.');
  }
});
