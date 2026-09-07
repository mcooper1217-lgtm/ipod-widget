Notion Troubleshooting & Diagnostic Guide

If you're embedding the iPod Widget inside Notion and the Spotify "Connect" popup closes but the embed doesn't update, Notion (or the browser when running inside Notion) is likely blocking the communication channel the widget uses to receive auth results.

Why this happens
- The widget tries three channels to receive auth results after the Spotify popup completes:
  1. BroadcastChannel (works when both windows share origin and allow same-site messaging)
  2. localStorage + storage events (works when the iframe and popup can access the same storage)
  3. postMessage to window.opener (fallback that often works but can be blocked depending on how Notion wraps the iframe)
- Notion can host embeds in contexts where BroadcastChannel or storage access is restricted or the embed is sandboxed. When that happens, the popup may successfully authenticate but the embed never receives the tokens.

What I added for diagnosis
- auth-debug.html — a small page that logs incoming postMessage, BroadcastChannel, and storage events and shows stored token values. It's hosted at:
  https://mcooper1217-lgtm.github.io/ipod-widget/auth-debug.html

How to use the diagnostic page
1. Open the diagnostic page in a normal browser tab (not inside Notion) and click "Open Spotify Auth". After completing the flow in the popup you should see postMessage/BroadcastChannel events logged and localStorage populated.
2. Embed the widget inside Notion and also open the diagnostic page inside Notion (if possible) to compare which channel works inside that environment.
3. If the diagnostic page shows messages but the Notion embed does not, Notion is likely isolating the embed and preventing the needed cross-window channels.

Workarounds and recommended UX
- Best reliable approach: instruct users to "Open in new tab" for the first-time Connect. That avoids Notion's iframe restrictions.
- If you need an in-embed flow, consider a server-side OAuth redirect (the redirect page can host a small endpoint that forwards tokens to the embed via a secure channel), or require a one-time manual paste of a short code from the redirect page into the widget.

What I can do next
- Add a short README section or update the main README to include these instructions (I added this file as a standalone guide). If you prefer, I can instead patch README.md directly.
- Add a tiny help banner in the widget UI that detects when no storage/BroadcastChannel/postMessage events are received and suggests opening in a new tab.


