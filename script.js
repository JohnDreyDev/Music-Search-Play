const localSongs = [{
        id: 1,
        title: "Eternal Dawn",
        artist: "SoundHelix",
        genre: "Ambient",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        source: "Sample",
        full: false
    },
    {
        id: 2,
        title: "Crystal Waves",
        artist: "SoundHelix",
        genre: "Electronic",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
        source: "Sample",
        full: false
    },
    {
        id: 3,
        title: "Midnight Echo",
        artist: "SoundHelix",
        genre: "Chill",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
        source: "Sample",
        full: false
    },
    {
        id: 4,
        title: "Rising Tide",
        artist: "SoundHelix",
        genre: "Lo-fi",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
        source: "Sample",
        full: false
    },
    {
        id: 5,
        title: "City Lights",
        artist: "SoundHelix",
        genre: "Pop",
        url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
        source: "Sample",
        full: false
    }
];

const uploadedSongs = [];
const queue = [];
let currentSong = null;
const ITUNES_API_URL = "https://itunes.apple.com/search";
const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const songList = document.getElementById("songList");
const resultCount = document.getElementById("resultCount");
const audioPlayer = document.getElementById("audioPlayer");
const nowPlayingTitle = document.getElementById("nowPlayingTitle");
const nowPlayingArtist = document.getElementById("nowPlayingArtist");
const fileUpload = document.getElementById("fileUpload");
const sourceFilter = document.getElementById("sourceFilter");
const queueList = document.getElementById("queueList");
const queueCount = document.getElementById("queueCount");
const queueButton = document.getElementById("queueButton");
const downloadButton = document.getElementById("downloadButton");
const dropOverlay = document.getElementById("dropOverlay");
const STORAGE_KEY = "music-player-queue";
let dragCounter = 0;

function sanitizeFileName(text) {
    return text.replace(/[^a-z0-9\.\- _]/gi, "_");
}

function highlightText(text, query) {
    if (!query) return text;
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return text.replace(new RegExp(escaped, "gi"), match => `<mark>${match}</mark>`);
}

function getLibrary() {
    return [...uploadedSongs, ...localSongs];
}

function searchLocalSongs(query) {
    const lowerQuery = query.toLowerCase();
    return getLibrary().map(song => ({
        ...song,
        highlightedTitle: highlightText(song.title, query),
        highlightedArtist: highlightText(song.artist, query),
        highlightedGenre: highlightText(song.genre, query)
    })).filter(song => {
        return [song.title, song.artist, song.genre].some(field => field.toLowerCase().includes(lowerQuery));
    });
}

function renderSongs(list) {
    songList.innerHTML = "";
    resultCount.textContent = `Showing ${list.length} ${list.length === 1 ? "song" : "songs"}`;

    if (!list.length) {
        songList.innerHTML = `<li class="song-item"><div class="song-meta"><p class="song-title">No matching songs found.</p><p class="song-subtitle">Try another search or upload a song.</p></div></li>`;
        return;
    }

    list.forEach(song => {
        const listItem = document.createElement("li");
        listItem.className = "song-item";

        const meta = document.createElement("div");
        meta.className = "song-meta";
        meta.innerHTML = `
      <p class="song-title">${song.highlightedTitle || song.title}</p>
      <p class="song-subtitle">${song.highlightedArtist || song.artist} · ${song.highlightedGenre || song.genre}
        <span class="tag">${song.source || "iTunes"}${song.full ? " · Full" : " · Preview"}</span>
      </p>
    `;

        const actions = document.createElement("div");
        actions.className = "song-actions";

        const playButton = document.createElement("button");
        playButton.textContent = "Play";
        playButton.addEventListener("click", () => playSong(song));

        const queueButtonItem = document.createElement("button");
        queueButtonItem.textContent = "Queue";
        queueButtonItem.className = "queue";
        queueButtonItem.addEventListener("click", () => addToQueue(song));

        actions.appendChild(playButton);
        actions.appendChild(queueButtonItem);
        listItem.appendChild(meta);
        listItem.appendChild(actions);
        songList.appendChild(listItem);
    });
}

function updateDownloadButton() {
    if (!currentSong) {
        downloadButton.classList.add("disabled");
        downloadButton.href = "#";
        downloadButton.removeAttribute("download");
        downloadButton.textContent = "Download";
        return;
    }

    downloadButton.classList.remove("disabled");
    downloadButton.href = currentSong.url;
    downloadButton.target = "_blank";
    const filename = sanitizeFileName(`${currentSong.title}-${currentSong.artist}`) + ".mp3";
    downloadButton.setAttribute("download", filename);
    downloadButton.textContent = currentSong.full ? "Download Full Track" : "Download Preview";
}

function updateQueueButton() {
    queueButton.disabled = !currentSong;
}

function persistQueue() {
    const savedQueue = queue.filter(song => song.source !== "Upload");
    if (savedQueue.length) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedQueue));
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

function restoreQueue() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
        const parsed = JSON.parse(saved);
        parsed.forEach(song => queue.push(song));
    } catch (error) {
        console.warn("Could not restore saved queue:", error);
    }
}

function renderQueue() {
    queueList.innerHTML = "";
    queueCount.textContent = `${queue.length} ${queue.length === 1 ? "track" : "tracks"} queued`;

    if (!queue.length) {
        queueList.innerHTML = `<li class="queue-item"><p>No tracks in queue yet. Add songs from search results or upload your own.</p></li>`;
        persistQueue();
        return;
    }

    queue.forEach((song, index) => {
        const item = document.createElement("li");
        item.className = "queue-item";

        const info = document.createElement("p");
        info.textContent = `${song.title} · ${song.artist}`;

        const removeButton = document.createElement("button");
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
            queue.splice(index, 1);
            renderQueue();
        });

        item.appendChild(info);
        item.appendChild(removeButton);
        queueList.appendChild(item);
    });

    persistQueue();
}

function playSong(song) {
    currentSong = song;
    audioPlayer.src = song.url;
    audioPlayer.play().catch(() => {
        // autoplay may be blocked; user can press play manually
    });
    nowPlayingTitle.textContent = song.title;
    nowPlayingArtist.textContent = `${song.artist} · ${song.genre}`;
    updateDownloadButton();
    updateQueueButton();
}

function addToQueue(song) {
    queue.push(song);
    renderQueue();
}

function preventDefault(event) {
    event.preventDefault();
    event.stopPropagation();
}

function setDragActive(active) {
    document.body.classList.toggle("dragging", active);
}

function handleFiles(files) {
    const fileList = Array.from(files || []);
    fileList.forEach((file, index) => {
        if (!file.type.startsWith("audio/")) return;
        const objectUrl = URL.createObjectURL(file);
        uploadedSongs.unshift({
            id: `upload-${Date.now()}-${index}`,
            title: file.name.replace(/\.[^/.]+$/, ""),
            artist: "Uploaded",
            genre: "Uploaded",
            url: objectUrl,
            source: "Upload",
            full: true
        });
    });
    renderSongs(getLibrary());
}

function handleDrop(files) {
    setDragActive(false);
    handleFiles(files);
}

function mapApiResults(results, query) {
    return results.map(result => ({
        id: `itunes-${result.trackId}`,
        title: result.trackName,
        artist: result.artistName,
        genre: result.primaryGenreName || "Music",
        url: result.previewUrl,
        source: "iTunes",
        full: false,
        highlightedTitle: highlightText(result.trackName, query),
        highlightedArtist: highlightText(result.artistName, query),
        highlightedGenre: highlightText(result.primaryGenreName || "Music", query)
    }));
}

async function fetchItunesSongs(query) {
    try {
        const url = `${ITUNES_API_URL}?term=${encodeURIComponent(query)}&entity=song&limit=20&media=music&country=US`;
        const response = await fetch(url);
        const data = await response.json();
        return mapApiResults(data.results || [], query);
    } catch (error) {
        console.error("iTunes search failed:", error);
        return [];
    }
}

async function performSearch() {
    const query = searchInput.value.trim();
    const source = sourceFilter.value;

    if (!query) {
        if (source === "itunes") {
            renderSongs([]);
        } else {
            renderSongs(getLibrary());
        }
        return;
    }

    resultCount.textContent = "Loading results...";
    const [apiSongs, localResults] = await Promise.all([
        source !== "library" ? fetchItunesSongs(query) : Promise.resolve([]),
        source !== "itunes" ? Promise.resolve(searchLocalSongs(query)) : Promise.resolve([])
    ]);

    const combined = [...localResults, ...apiSongs];
    renderSongs(combined);
}

function handleUpload(event) {
    handleFiles(event.target.files);
    event.target.value = "";
}

searchButton.addEventListener("click", performSearch);
searchInput.addEventListener("keydown", event => {
    if (event.key === "Enter") performSearch();
});
sourceFilter.addEventListener("change", performSearch);
queueButton.addEventListener("click", () => {
    if (currentSong) addToQueue(currentSong);
});
fileUpload.addEventListener("change", handleUpload);
audioPlayer.addEventListener("ended", () => {
    if (queue.length) {
        playSong(queue.shift());
        renderQueue();
    }
});

document.addEventListener("dragenter", event => {
    preventDefault(event);
    dragCounter += 1;
    setDragActive(true);
});
document.addEventListener("dragover", preventDefault);
document.addEventListener("dragleave", event => {
    preventDefault(event);
    dragCounter -= 1;
    if (dragCounter <= 0) {
        dragCounter = 0;
        setDragActive(false);
    }
});
document.addEventListener("drop", event => {
    preventDefault(event);
    dragCounter = 0;
    handleDrop(event.dataTransfer.files);
});

renderSongs(getLibrary());
restoreQueue();
renderQueue();