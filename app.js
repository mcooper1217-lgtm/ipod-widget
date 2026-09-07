const CLIENT_ID = '6deaf4e348c54584aa56fe560fb2c264';
const REDIRECT_URI = 'https://mcooper1217-lgtm.github.io/ipod-widget/';

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

// 1. Open Auth Popup
async function loginWithSpotify() {
  const codeVerifier = generateRandomString(64);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64encode(hashed);

  localStorage.setItem('code_verifier', codeVerifier);
  sessionStorage.setItem('code_verifier', codeVerifier);

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

  // If there is no code in URL, check if we already have an active token saved
  if (!code) {
    checkExistingToken();
    return;
  }

  const codeVerifier = localStorage.getItem('code_verifier') || sessionStorage.getItem('code_verifier');

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
      // If running inside the popup, transmit tokens to parent iframe & immediately close
      if (window.opener) {
        window.opener.postMessage({
          type: 'spotify_auth_success',
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          expires_in: data.expires_in
        }, '*');
        
        // Clear query parameters and close window
        window.history.replaceState({}, document.title, window.location.pathname);
        window.close();
        return;
      }

      // Fallback if not in a popup
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('expires_at', Date.now() + (data.expires_in * 1000));
      window.history.replaceState({}, document.title, window.location.pathname);
      updateUIAuthorized();
    }
  } catch (err) {
    console.error('Error exchanging token:', err);
  }
}

// Listen for token message sent from popup window to embedded iframe
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'spotify_auth_success') {
    const { access_token, refresh_token, expires_in } = event.data;

    // Save received tokens inside the Notion iframe's scope
    localStorage.setItem('access_token', access_token);
    localStorage.setItem('refresh_token', refresh_token);
    localStorage.setItem('expires_at', Date.now() + (expires_in * 1000));

    updateUIAuthorized();
  }
});

// Check existing login
function checkExistingToken() {
  const token = localStorage.getItem('access_token');
  const expiresAt = localStorage.getItem('expires_at');

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
    window.playingInterval = setInterval(getCurrentlyPlaying, 5000);
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
