const PLAYLIST_ID = '2QKtdnf8wgOlwksQYIHdXz';
const PLAYLIST_URI = `spotify:playlist:${PLAYLIST_ID}`;
const PLAYLIST_URL = `https://open.spotify.com/playlist/${PLAYLIST_ID}`;

let controller = null;
const screen = document.getElementById('screen');
const status = document.getElementById('status');

function setStatus(message) {
  if (status) status.textContent = message;
}

window.onSpotifyIframeApiReady = (IFrameAPI) => {
  const element = document.getElementById('embed-iframe');
  const options = {
    uri: PLAYLIST_URI,
    width: '100%',
    height: '100%',
    theme: 'dark'
  };

  IFrameAPI.createController(element, options, (spotifyController) => {
    controller = spotifyController;
    screen.classList.add('spotify-ready');

    controller.addListener('ready', () => setStatus('Spotify ready'));
    controller.addListener('playback_update', (event) => {
      const isPaused = event?.data?.isPaused;
      setStatus(isPaused === false ? 'Playing' : 'Ready');
    });
  });
};

function useController(method) {
  if (!controller || typeof controller[method] !== 'function') {
    setStatus('Still connecting…');
    return;
  }
  controller[method]();
}

document.getElementById('center-btn').addEventListener('click', () => useController('togglePlay'));
document.getElementById('play-btn').addEventListener('click', () => useController('togglePlay'));
document.getElementById('next-btn').addEventListener('click', () => useController('next'));
document.getElementById('prev-btn').addEventListener('click', () => useController('previous'));
document.getElementById('menu-btn').addEventListener('click', () => window.open(PLAYLIST_URL, '_blank', 'noopener'));

document.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    useController('togglePlay');
  } else if (event.key === 'ArrowRight') {
    useController('next');
  } else if (event.key === 'ArrowLeft') {
    useController('previous');
  }
});

setTimeout(() => {
  if (!controller) setStatus('Could not load Spotify — open MENU');
}, 10000);
