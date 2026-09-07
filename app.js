const CLIENT_ID = '6deaf4e348c54584aa56fe560fb2c264';
const REDIRECT_URI = 'https://mcooper1217-lgtm.github.io/ipod-widget/';

// Setup Broadcast Channel for cross-window communication in Notion
const authChannel = new BroadcastChannel('spotify_auth_channel');

// PKCE Crypto Helpers
function generateRandomString(length) {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
}

function base64encode(input) {
  return btoa(String.fromCharCode(...new Uint8Array(input)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

// 1. Redirect to Spotify Auth via Popup Window
async function loginWithSpotify() {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem('code_verifier', codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    scope: 'user-read-playback-state user-modify-playback-state streaming',
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    redirect_uri: REDIRECT_URI,
  });

  const authUrl = `https://accounts.spotify.com/authorize?${params.toString()}`;

  const width = 450;
  const height = 730;
  const left = (window.screen.width / 2) - (width / 2);
  const top = (window.screen.height / 2) - (height / 2);

  window.open(
    authUrl,
    'SpotifyLogin',
    `width=${width},height=${height},top=${top},left=${left}`
  );
}

// 2. Handle Auth Code Callback
async function handleCallback() {
  const urlParams = new URLSearchParams(window.location.search);
  const code = urlParams.get('code');

  if (!code) {
    checkExistingToken();
    return;
  }

  const codeVerifier = localStorage.getItem('code_verifier');

  const payload = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  };

  try {
    const response = await fetch('https://accounts.spotify.com/api/token', payload);
    const data = await response.json();

    if (data.access_token) {
      const authData = {
        type: 'spotify_auth_success',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in
      };

      // Broadcast tokens over BroadcastChannel
      authChannel.postMessage(authData);

      // Save directly to localStorage to trigger storage events
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('expires_at', String(Date.now() + (data.expires_in * 1000)));

      // Attempt postMessage fallback
      if (window.opener) {
        try {
          window.opener.postMessage(authData, '*');
        } catch (e) {
          console.log('postMessage blocked by cross-origin policy:', e);
        }
      }

      // Close popup automatically
      setTimeout(() => {
        window.close();
      }, 300);
    }
  } catch (err) {
    console.error('Error exchanging token:', err);
  }
}

// Listen for messages via BroadcastChannel
authChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'spotify_auth_success') {
    console.log('Received auth via BroadcastChannel', event.data);
    applyAuthData(event.data);
  }
};

// Listen for localStorage changes across windows/frames
window.addEventListener('storage', (event) => {
  if (event.key === 'access_token' && event.newValue) {
    console.log('storage event detected, access_token changed');
    updateUIAuthorized();
  }
});

// NEW: Listen for postMessage from popup (fallback path used by popup)
window.addEventListener('message', (event) => {
  // Optional: verify origin to be more secure:
  // const allowedOrigins = ['https://mcooper1217-lgtm.github.io'];
  // if (!allowedOrigins.includes(event.origin)) return;

  if (!event.data) return;

  // event.data should be an object already (popup posts an object)
  const data = event.data;
  if (data.type === 'spotify_auth_success') {
    console.log('Received auth via postMessage', data, 'origin:', event.origin);
    applyAuthData(data);
  }
});

function applyAuthData(data) {
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('expires_at', String(Date.now() + (data.expires_in * 1000)));
  updateUIAuthorized();
}

// Check existing login
function checkExistingToken() {
  const token = localStorage.getItem('access_token');
  const expiresAt = parseInt(localStorage.getItem('expires_at'), 10) || 0;

  if (token && Date.now() < expiresAt) {
    updateUIAuthorized();
  }
}

function updateUIAuthorized() {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.style.display = 'none';
  }
  getCurrentlyPlaying();

  if (!window.playingInterval) {
    window.playingInterval = setInterval(getCurrentlyPlaying, 3000);
  }
}

document.addEventListener('DOMContentLoaded', handleCallback);

// Safe Spotify API Request Helper
async function spotifyFetch(endpoint, method = 'GET', body = null) {
  const token = localStorage.getItem('access_token');
  if (!token) return;

  try {
    const options = {
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    if (body) options.body = JSON.stringify(body);

    const res = await fetch(`https://api.spotify.com/v1/me/player/${endpoint}`, options);

    if (res.status === 204) {
      return true;
    }

    if (res.status === 200) {
      return await res.json();
    }

    if (res.status === 401) {
      localStorage.removeItem('access_token');
      location.reload();
    }
  } catch (err) {
    console.error('API Error:', err);
  }
}

// Fetch currently playing track metadata & album cover art
async function getCurrentlyPlaying() {
  const data = await spotifyFetch('currently-playing');
  const trackElem = document.getElementById('track-name');
  const artistElem = document.getElementById('artist-name');
  const albumArtElem = document.getElementById('album-art');

  if (data && data.item) {
    if (trackElem) trackElem.innerText = data.item.name;
    if (artistElem) artistElem.innerText = data.item.artists.map(a => a.name).join(', ');

    if (albumArtElem && data.item.album.images.length > 0) {
      albumArtElem.src = data.item.album.images[1]?.url || data.item.album.images[0]?.url;
    }
  } else {
    if (trackElem) trackElem.innerText = 'Nothing Playing';
    if (artistElem) artistElem.innerText = 'Open Spotify on phone/PC';
  }
}

// Playback Actions
async function togglePlay() {
  const data = await spotifyFetch('');
  if (data && data.is_playing) {
    await spotifyFetch('pause', 'PUT');
  } else {
    await spotifyFetch('play', 'PUT');
  }
  setTimeout(getCurrentlyPlaying, 500);
}

async function nextTrack() {
  await spotifyFetch('next', 'POST');
  setTimeout(getCurrentlyPlaying, 500);
}

async function previousTrack() {
  await spotifyFetch('previous', 'POST');
  setTimeout(getCurrentlyPlaying, 500);
}

// Sync device function for MENU button
async function syncDeviceAndPlay() {
  const data = await spotifyFetch('devices');
  const artistElem = document.getElementById('artist-name');
  const trackElem = document.getElementById('track-name');

  if (data && data.devices && data.devices.length > 0) {
    const activeDevice = data.devices.find(d => d.is_active) || data.devices[0];
    if (artistElem) artistElem.innerText = `Device: ${activeDevice.name}`;
  } else {
    if (trackElem) trackElem.innerText = 'No Active Device';
    if (artistElem) artistElem.innerText = 'Open Spotify on Phone/PC';
  }
}
