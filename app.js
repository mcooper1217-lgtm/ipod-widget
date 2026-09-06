const CLIENT_ID = '6deaf4e348c54584aa56fe560fb2c264'; // Replace with your ID
const REDIRECT_URI = 'https://mcooper1217-lgtm.github.io/ipod-widget/'; // Auto-detects GitHub Pages URL

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

// 1. Redirect to Spotify Auth
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

  window.location.href = `https://accounts.spotify.com/authorize?${params.toString()}`;
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
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('expires_at', Date.now() + (data.expires_in * 1000));

      // Clear code from URL bar
      window.history.replaceState({}, document.title, window.location.pathname);
      updateUIAuthorized();
    }
  } catch (err) {
    console.error('Error exchanging token:', err);
  }
}

// Check if user is already logged in
function checkExistingToken() {
  const token = localStorage.getItem('access_token');
  const expiresAt = localStorage.getItem('expires_at');

  if (token && Date.now() < expiresAt) {
    updateUIAuthorized();
  }
}

function updateUIAuthorized() {
  document.getElementById('auth-status').innerText = 'Status: Connected';
  document.getElementById('login-btn').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', handleCallback);

// Helper for Spotify API requests
// Updated helper to safely parse empty 204 responses
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

    // Return JSON if status is 200 OK
    if (res.status === 200) {
      return await res.json();
    }
    return true; // Return true for 204 No Content success responses
  } catch (err) {
    console.error('API Error:', err);
  }
}

// Updated toggle function
async function togglePlay() {
  const data = await spotifyFetch(''); // Fetch current player state
  
  if (data && data.is_playing) {
    await spotifyFetch('pause', 'PUT');
  } else {
    await spotifyFetch('play', 'PUT');
  }
  setTimeout(getCurrentlyPlaying, 300);
}
// Fetch currently playing track metadata
async function getCurrentlyPlaying() {
  const data = await spotifyFetch('currently-playing');
  if (data && data.item) {
    document.getElementById('track-name').innerText = data.item.name;
    document.getElementById('artist-name').innerText = data.item.artists.map(a => a.name).join(', ');
  } else {
    document.getElementById('track-name').innerText = 'Nothing Playing';
    document.getElementById('artist-name').innerText = 'Open Spotify on phone/PC';
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

// Auto-refresh song info every 5 seconds when authorized
function updateUIAuthorized() {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    loginBtn.style.display = 'none';
  }
  getCurrentlyPlaying();
  setInterval(getCurrentlyPlaying, 5000);
}
