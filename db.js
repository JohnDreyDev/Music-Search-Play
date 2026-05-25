const path = require('path');
const fs = require('fs');

const DATA_FILE = path.join(__dirname, 'data.json');

const defaultData = {
    tracks: [],
    playlists: [],
    playlist_tracks: []
};

function ensureDataFile() {
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(defaultData, null, 2));
    }
}

function loadData() {
    ensureDataFile();
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
}

function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

const raw = loadData();
raw.playlists = Array.isArray(raw.playlists) ? raw.playlists : [];
raw.playlist_tracks = Array.isArray(raw.playlist_tracks) ? raw.playlist_tracks : [];
const hasTrackIds = raw.playlists.some(p => Array.isArray(p.trackIds) && p.trackIds.length > 0);
const hasPlaylistTracks = raw.playlist_tracks.length > 0;

if (hasTrackIds && !hasPlaylistTracks) {
    raw.playlists.forEach(playlist => {
        (playlist.trackIds || []).forEach(trackId => {
            raw.playlist_tracks.push({ playlist_id: playlist.id, track_id: trackId });
        });
    });
    saveData(raw);
}

const db = {
    data: raw,
    save() {
        saveData(this.data);
    }
};

module.exports = db;