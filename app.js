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
