[README.md](https://github.com/user-attachments/files/32348627/README.md)
# iPod Spotify Widget

A small iPod-style player for this Spotify playlist:

`https://open.spotify.com/playlist/2QKtdnf8wgOlwksQYIHdXz`

## What changed

This version uses Spotify's official Embed IFrame API. It does not use a client ID, OAuth popup, access tokens, or an active Spotify device. The old OAuth implementation opened the authorization flow twice and only attempted to remotely control an already-active Spotify app.

## Deploy on GitHub Pages

1. Replace the repository's `index.html`, `app.js`, and `style.css` with these files.
2. Commit and push to the `main` branch.
3. In GitHub, open **Settings → Pages**.
4. Set the source to **Deploy from a branch**, select `main` and `/ (root)`, then save.
5. Wait for the Pages deployment to finish and hard-refresh the site.

## Embed in Notion

Embed the hosted HTTPS URL, not the HTML file itself:

`https://mcooper1217-lgtm.github.io/ipod-widget/`

Spotify may require the listener to sign in. Full-track playback is controlled by Spotify and may depend on account, browser, and regional availability.
