const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const uploadsDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

function sanitizeFileName(name) {
    return name.replace(/[^a-z0-9.\- _]/gi, '_');
}

const storage = multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        const base = path.basename(file.originalname, ext);
        const safeName = sanitizeFileName(base);
        cb(null, `${Date.now()}-${safeName}${ext}`);
    }
});

const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('audio/')) {
            return cb(new Error('Only audio files are allowed'));
        }
        cb(null, true);
    }
});

app.use(express.json());

// Serve frontend static files
app.use(express.static(path.join(__dirname)));

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
});

// Get all tracks
app.get('/api/tracks', (req, res) => {
    res.json(db.data.tracks || []);
});

// Get a single track by ID
app.get('/api/tracks/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const track = (db.data.tracks || []).find(track => track.id === id);
    if (!track) return res.status(404).json({ error: 'Track not found' });
    res.json(track);
});

// Add a new track
app.post('/api/tracks', (req, res) => {
    const { title, artist, genre, duration, url } = req.body;
    if (!title || !artist) {
        return res.status(400).json({ error: 'Title and artist required' });
    }
    db.data.tracks = db.data.tracks || [];
    const newTrack = {
        id: Math.max(0, ...db.data.tracks.map(t => t.id)) + 1,
        title,
        artist,
        genre: genre || 'Unknown',
        duration: duration || 0,
        url: url || ''
    };
    db.data.tracks.push(newTrack);
    db.save();
    res.status(201).json(newTrack);
});

// Delete a track
app.delete('/api/tracks/:id', (req, res) => {
    const trackId = parseInt(req.params.id, 10);
    const track = (db.data.tracks || []).find(track => track.id === trackId);
    if (!track) return res.status(404).json({ error: 'Track not found' });
    db.data.playlist_tracks = (db.data.playlist_tracks || []).filter(link => link.track_id !== trackId);
    db.data.tracks = (db.data.tracks || []).filter(track => track.id !== trackId);
    db.save();
    res.json(track);
});

// Search tracks
app.get('/api/search', (req, res) => {
    const q = (req.query.q || '').toLowerCase().trim();
    if (!q) return res.json([]);
    const results = (db.data.tracks || []).filter(track =>
        track.title.toLowerCase().includes(q) ||
        track.artist.toLowerCase().includes(q) ||
        (track.genre || '').toLowerCase().includes(q)
    );
    res.json(results);
});

// Upload audio files and register them as full tracks
app.post('/api/upload', upload.array('files', 20), (req, res) => {
    if (!req.files || !req.files.length) {
        return res.status(400).json({ error: 'No files uploaded' });
    }

    db.data.tracks = db.data.tracks || [];
    let nextId = Math.max(0, ...db.data.tracks.map(t => t.id)) + 1;

    const newTracks = req.files.map(file => {
        const title = path.basename(file.originalname, path.extname(file.originalname));
        const newTrack = {
            id: nextId++,
            title,
            artist: 'Uploaded',
            genre: 'Uploaded',
            duration: 0,
            url: `/uploads/${file.filename}`
        };
        db.data.tracks.push(newTrack);
        return newTrack;
    });

    db.save();
    res.status(201).json(newTracks);
});

// Get all playlists
app.get('/api/playlists', (req, res) => {
    res.json(db.data.playlists || []);
});

// Get a single playlist with its tracks
app.get('/api/playlists/:id', (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    const playlist = (db.data.playlists || []).find(p => p.id === playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    const tracks = (db.data.playlist_tracks || [])
        .filter(link => link.playlist_id === playlistId)
        .map(link => (db.data.tracks || []).find(track => track.id === link.track_id))
        .filter(Boolean);
    res.json({...playlist, tracks });
});

// Create a new playlist
app.post('/api/playlists', (req, res) => {
    const { name, description, trackIds } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    db.data.playlists = db.data.playlists || [];
    db.data.playlist_tracks = db.data.playlist_tracks || [];
    const newPlaylist = {
        id: Math.max(0, ...db.data.playlists.map(p => p.id)) + 1,
        name,
        description: description || '',
        createdAt: new Date().toISOString()
    };
    db.data.playlists.push(newPlaylist);
    const ids = Array.isArray(trackIds) ? trackIds.map(Number).filter(Boolean) : [];
    ids.forEach(trackId => {
        db.data.playlist_tracks.push({ playlist_id: newPlaylist.id, track_id: trackId });
    });
    db.save();
    const tracks = db.data.playlist_tracks
        .filter(link => link.playlist_id === newPlaylist.id)
        .map(link => (db.data.tracks || []).find(track => track.id === link.track_id))
        .filter(Boolean);
    res.status(201).json({...newPlaylist, tracks });
});

// Update a playlist
app.put('/api/playlists/:id', (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    const { name, description, trackIds } = req.body;
    const playlist = (db.data.playlists || []).find(p => p.id === playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    playlist.name = name || playlist.name;
    playlist.description = description !== undefined ? description : playlist.description;

    if (Array.isArray(trackIds)) {
        db.data.playlist_tracks = (db.data.playlist_tracks || []).filter(link => link.playlist_id !== playlistId);
        trackIds.map(Number).filter(Boolean).forEach(trackId => {
            db.data.playlist_tracks.push({ playlist_id: playlistId, track_id: trackId });
        });
    }

    db.save();
    const tracks = (db.data.playlist_tracks || [])
        .filter(link => link.playlist_id === playlistId)
        .map(link => (db.data.tracks || []).find(track => track.id === link.track_id))
        .filter(Boolean);
    res.json({...playlist, tracks });
});

// Delete a playlist
app.delete('/api/playlists/:id', (req, res) => {
    const playlistId = parseInt(req.params.id, 10);
    const playlist = (db.data.playlists || []).find(p => p.id === playlistId);
    if (!playlist) return res.status(404).json({ error: 'Playlist not found' });
    db.data.playlist_tracks = (db.data.playlist_tracks || []).filter(link => link.playlist_id !== playlistId);
    db.data.playlists = (db.data.playlists || []).filter(p => p.id !== playlistId);
    db.save();
    res.json(playlist);
});

// Fallback: serve index.html for SPA routes
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Music System backend listening on http://localhost:${PORT}`);
});