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

// Helper: base64url encode/decode for paste-codes
function base64UrlEncode(str) {
  return btoa(unescape(encodeURIComponent(str))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
function base64UrlDecode(input) {
  input = input.replace(/-/g, '+').replace(/_/g, '/');
  while (input.length % 4) input += '=';
  return decodeURIComponent(escape(atob(input)));
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
      const expiresAt = Date.now() + (data.expires_in * 1000);
      const authData = {
        type: 'spotify_auth_success',
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_in: data.expires_in
      };

      // Broadcast tokens over BroadcastChannel
      try { authChannel.postMessage(authData); } catch (e) { /* ignore */ }

      // Save directly to localStorage to trigger storage events
      localStorage.setItem('access_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('expires_at', String(expiresAt));

      // Create a one-time paste-code (base64url of small JSON) and show it so users can copy/paste into embeds
      const payloadForCode = JSON.stringify({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: expiresAt
      });
      const pasteCode = base64UrlEncode(payloadForCode);
      showPasteCodeOverlay(pasteCode);

      // Attempt postMessage fallback (still do this so popups to regular pages auto-complete)
      if (window.opener) {
        try {
          window.opener.postMessage(authData, '*');
        } catch (e) {
          console.log('postMessage blocked by cross-origin policy:', e);
        }
      }

      // Do NOT auto-close immediately — we want the user to copy the paste-code if needed.
      // Provide a "Copy & Close" button in the overlay. If you prefer auto-close for standard flows, that can be re-added conditionally.
    }
  } catch (err) {
    console.error('Error exchanging token:', err);
  }
}

// Show overlay on redirect page with the paste code and a copy button
function showPasteCodeOverlay(code) {
  // If overlay exists, update code
  let overlay = document.getElementById('paste-code-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'paste-code-overlay';
    overlay.style = 'position:fixed;inset:12px;padding:18px;background:#fff;border:1px solid #ddd;border-radius:8px;z-index:99999;max-width:720px;margin:auto;left:0;right:0;top:12px;font-family:system-ui, -apple-system, Roboto, "Segoe UI", Arial;box-shadow:0 6px 30px rgba(0,0,0,0.12)';

    overlay.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <strong>Copy Connect Code</strong>
        <div style="display:flex;gap:8px">
          <button id="paste-copy-close" style="padding:6px 10px">Copy & Close</button>
          <button id="paste-close" style="padding:6px 10px">Close</button>
        </div>
      </div>
      <div style="margin-bottom:8px;color:#333">If you're authenticating from a restricted embed (like Notion), copy this code and paste it into the widget inside Notion to finish connecting. Treat this code like a secret while it's valid.</div>
      <pre id="paste-code-box" style="background:#f6f8fa;padding:12px;border-radius:6px;overflow:auto;">${code}</pre>
    `;

    document.body.appendChild(overlay);

    document.getElementById('paste-copy-close').addEventListener('click', async () => {
      const text = document.getElementById('paste-code-box').innerText;
      try { await navigator.clipboard.writeText(text); } catch (e) { console.warn('copy failed', e); }
      try { window.close(); } catch (e) { /* ignore */ }
    });
    document.getElementById('paste-close').addEventListener('click', () => {
      overlay.remove();
    });
  } else {
    const box = document.getElementById('paste-code-box');
    if (box) box.innerText = code;
  }
}

// Listen for messages via BroadcastChannel
authChannel.onmessage = (event) => {
  if (event.data && event.data.type === 'spotify_auth_success') {
    applyAuthData(event.data);
  }
};

// Listen for localStorage changes across windows/frames
window.addEventListener('storage', (event) => {
  if (event.key === 'access_token' && event.newValue) {
    updateUIAuthorized();
  }
});

function applyAuthData(data) {
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  localStorage.setItem('expires_at', String(Date.now() + (data.expires_in * 1000)));
  removeNotionFallbackBanner();
  updateUIAuthorized();
}

// Paste-code decode + apply flow (widget side) -- user pastes code shown on redirect page
function decodeAndApplyPasteCode(code) {
  try {
    const json = base64UrlDecode(code.trim());
    const payload = JSON.parse(json);
    if (!payload || !payload.access_token) throw new Error('invalid');

    // Apply tokens
    localStorage.setItem('access_token', payload.access_token);
    if (payload.refresh_token) localStorage.setItem('refresh_token', payload.refresh_token);
    if (payload.expires_at) localStorage.setItem('expires_at', String(payload.expires_at));

    // Update UI
    removeNotionFallbackBanner();
    updateUIAuthorized();
    return true;
  } catch (err) {
    console.error('Failed to decode paste code', err);
    return false;
  }
}

function promptAndApplyPasteCode() {
  const code = window.prompt('Paste Connect code from the redirect page (the long string you copied)');
  if (!code) return;
  const ok = decodeAndApplyPasteCode(code);
  if (!ok) alert('Invalid code — please make sure you pasted the full code from the redirect page.');
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
  const pasteBtn = document.getElementById('paste-code-btn');
  if (pasteBtn) pasteBtn.style.display = 'none';
  getCurrentlyPlaying();

  if (!window.playingInterval) {
    window.playingInterval = setInterval(getCurrentlyPlaying, 3000);
  }
}

document.addEventListener('DOMContentLoaded', handleCallback);

// --- UX fallback helpers for embed environments (Notion) ---

function showNotionFallbackBanner() {
  if (document.getElementById('notion-fallback')) return;
  const banner = document.createElement('div');
  banner.id = 'notion-fallback';
  banner.style = 'position:fixed;bottom:12px;left:12px;right:12px;padding:12px;background:#fff3cd;border:1px solid #ffeeba;border-radius:6px;z-index:9999;display:flex;align-items:center;gap:8px;font-family:system-ui, -apple-system, Roboto, "Segoe UI", Arial;';

  banner.innerHTML = `
    <div style="flex:1">The Connect flow may be blocked inside some embeds (Notion). If connecting doesn't finish, open the widget in a new tab to complete authentication.</div>
    <div style="display:flex;gap:8px">
      <button id="notion-open-tab" style="padding:6px 10px">Open in new tab</button>
      <button id="notion-paste" style="padding:6px 10px">Paste Connect Code</button>
      <button id="notion-retry" style="padding:6px 10px">Retry Connect</button>
      <button id="notion-close" style="padding:6px 10px">Dismiss</button>
    </div>
  `;

  document.body.appendChild(banner);
  document.getElementById('notion-open-tab').addEventListener('click', () => {
    window.open(REDIRECT_URI, '_blank');
  });
  document.getElementById('notion-paste').addEventListener('click', () => {
    promptAndApplyPasteCode();
  });
  document.getElementById('notion-retry').addEventListener('click', () => {
    // re-run the login flow
    loginWithSpotifyAndDetect();
  });
  document.getElementById('notion-close').addEventListener('click', () => {
    removeNotionFallbackBanner();
  });
}

function removeNotionFallbackBanner() {
  const el = document.getElementById('notion-fallback');
  if (el) el.remove();
}

async function loginWithSpotifyAndDetect() {
  // Start the popup
  loginWithSpotify();

  let success = false;
  let bcHandler = null;
  let timeoutId = null;

  function onSuccess() {
    success = true;
    cleanup();
  }

  function messageHandler(e) {
    try {
      if (e && e.data && e.data.type === 'spotify_auth_success') {
        onSuccess();
      }
    } catch (err) { /* ignore malformed messages */ }
  }

  function storageHandler(e) {
    if (e && e.key === 'access_token' && e.newValue) {
      onSuccess();
    }
  }

  // BroadcastChannel listener (reuse authChannel if available)
  try {
    bcHandler = (ev) => {
      if (ev && ev.data && ev.data.type === 'spotify_auth_success') {
        onSuccess();
      }
    };
    authChannel.addEventListener('message', bcHandler);
  } catch (e) {
    // ignore if unavailable
  }

  window.addEventListener('message', messageHandler);
  window.addEventListener('storage', storageHandler);

  timeoutId = setTimeout(() => {
    if (!success) {
      showNotionFallbackBanner();
    }
    cleanup();
  }, 6000);

  function cleanup() {
    window.removeEventListener('message', messageHandler);
    window.removeEventListener('storage', storageHandler);
    try { if (bcHandler) authChannel.removeEventListener('message', bcHandler); } catch (e) {}
    if (timeoutId) clearTimeout(timeoutId);
  }
}

// Add a small "Paste code" button next to login to make it visible
function addPasteCodeButton() {
  const loginBtn = document.getElementById('login-btn');
  if (!loginBtn) return;
  if (document.getElementById('paste-code-btn')) return;
  const pasteBtn = document.createElement('button');
  pasteBtn.id = 'paste-code-btn';
  pasteBtn.innerText = 'Paste Connect Code';
  pasteBtn.style = 'margin-left:8px;padding:6px 10px';
  pasteBtn.addEventListener('click', promptAndApplyPasteCode);
  loginBtn.insertAdjacentElement('afterend', pasteBtn);
}

// Attach enhanced login handler to login button (if present)
document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) {
    // prefer the detect wrapper so embeds get the fallback
    loginBtn.removeEventListener('click', loginWithSpotify);
    loginBtn.addEventListener('click', loginWithSpotifyAndDetect);
  }
  addPasteCodeButton();
});

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
