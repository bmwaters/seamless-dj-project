# Seamless DJ Project

**A React + Node.js app for managing event-tailored playlists with smooth transitions, queue control, and Spotify integration.**

---

## What is the purpose?

This app is for an all day event that will have different vibes and different sized playlists, from one song to thirty songs, that need to be played throughout the day. Think of it as your own personal dj all in one mobile device with your very own playlists from Spotify in exactly the order you want them to be played. 

---

## Features

- Manage multiple playlists for different events or moments.
- Smooth song transitions between tracks.
- Queue control to skip, pause, or reorder songs.
- Easy access for MC announcements or pauses during events.
- Spotify integration to pull personalized playlists.

---

## How It Works

1. Users select pre-made, event-tailored playlists from Spotify.
2. The app queues the songs and manages smooth transitions between tracks.
3. During events, the user can pause or skip songs for announcements or special moments.
4. A simple interface shows the current song, upcoming tracks, and the playlist flow.
5. The app ensures a continuous, seamless music experience for different event phases.

---

## Tech Stack

- **Frontend:** React
- **Backend:** Node.js
- **APIs:** Spotify Web API
- **Version Control:** Git & GitHub

---

## How to run it

On a Mac this is **Terminal** (Spotlight → Terminal), not Windows Command Prompt. You can also use the terminal panel in Cursor. You need **two** of them.

**Terminal 1 — backend**

```bash
cd ~/seamless-dj-project/backend
npm start
```

Wait until it says `Server running on http://127.0.0.1:5050`.

**Terminal 2 — frontend**

```bash
cd ~/seamless-dj-project/frontend
npm start
```

Wait until it says `Compiled successfully!`

**Browser**

Open **http://127.0.0.1:3000** (type that in the address bar; don’t use `localhost`). Click **Log in with Spotify**.

In the Spotify developer app, the redirect URI must be `http://127.0.0.1:5050/callback`.

Leave both terminals open. To stop, click each terminal and press `Control+C`.

---


