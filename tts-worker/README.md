# Bangers TTS Worker

Free Cloudflare Worker that turns recap text into `audio/mpeg` via Microsoft Edge TTS (same neural voices as local `edge-tts`). No paid API key.

One-time deploy and GitHub Pages wiring: see the **Hosted .mp3 recaps (GitHub Pages)** section in the [root README](../README.md).

```bash
cd tts-worker
npx wrangler deploy
```

- `GET /health` → `{ "ok": true }`
- `POST /tts` with `{ "text": "...", "voice": "en-US-AndrewNeural" }` → `audio/mpeg`
