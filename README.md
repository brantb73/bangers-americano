# Bangers · Americano

Mobile-first web app for running recreational **doubles Americano** pickleball sessions — rotating partners, individual **point differential**. Session state lives in `localStorage` **per browser/device** (a tunnel URL on your phone won’t see laptop data). Use **Export/Import** on the home screen to move sessions.

Scoring UI is client-only. **Shareable .mp3 recaps** use a hosted Cloudflare Worker on GitHub Pages (see [Hosted .mp3 recaps](#hosted-mp3-recaps-github-pages)), or same-origin `/api/tts` when you run Vite locally (see [Audio share](#audio-share-real-mp3)).

## How to run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173/bangers-americano/` — the app is built with the GitHub Pages project base path).

### Test / build

```bash
npm test
npm run build
npm run preview   # serve the production build locally (includes /api/tts)
```

### Open on a phone (same Wi‑Fi)

1. Find your laptop’s local IP (e.g. `192.168.1.42`).
2. On the phone browser go to `http://YOUR_IP:5173/bangers-americano/` (Vite is configured with `host: true`).
3. Add to Home Screen if you like — works offline for the loaded session UI once cached by the browser (still no backend).

**Optional tunnel:** if phone and laptop are on different networks, use a tunnel such as [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/) or `npx localtunnel --port 5173` and open the public URL on the phone.

## GitHub Pages / static hosting

Vite is configured with `base: '/bangers-americano/'` for the project site:

**https://brantb73.github.io/bangers-americano/**

`npm run build` emits a static site in `dist/`. On every push to `main`, `.github/workflows/deploy-pages.yml` runs `npm ci`, `npm run build` (injecting `VITE_TTS_URL` when set), uploads `dist`, and deploys with `actions/upload-pages-artifact` + `actions/deploy-pages`.

- **UI works** without a Node process: roster, scoring, standings, history, text recaps, and Web Speech preview.
- **Generate audio / Share .mp3** on Pages calls the remote Worker from `VITE_TTS_URL` (see [Hosted .mp3 recaps](#hosted-mp3-recaps-github-pages)). Same-origin `/api/tts` exists only for `npm run dev` / `preview`.

### Enable Pages after this lands on `main`

1. Open the repo on GitHub: [brantb73/bangers-americano](https://github.com/brantb73/bangers-americano).
2. Click **Settings**.
3. In the left sidebar, click **Pages**.
4. Under **Build and deployment** → **Source**, choose **GitHub Actions** (not “Deploy from a branch”).
5. Merge this change to `main` (or push to `main` if it is already merged). Watch **Actions** for the **Deploy GitHub Pages** workflow.
6. When the **deploy** job is green, open **https://brantb73.github.io/bangers-americano/**.

If Pages was enabled after the first `main` workflow already ran, open **Actions** → **Deploy GitHub Pages** → **Run workflow** (workflow_dispatch) to publish without another commit.

## How a session works

1. **Add players** (4–16; typical 8–16).
2. **Settings:** courts (1–4), **game to** (9 / 11 / 15 / 21), and **win by** (1 or **2**, default **2**). Summary shows e.g. “First to 11, win by 2”.
3. **Start** — generates Round 1 with whist/Americano-style pairings (maximizes unique partners).
4. **Enter scores** after each court finishes. Validation enforces game-to / win-by by default. **Sudden death — end game now** accepts an early finish (e.g. 5–6) with a clear winner (ties blocked). Each player gets the **point differential** (win 11–5 → +6; lose 11–5 → −6; sudden death 6–5 → +1). Wrong court? Tap the score or **Edit score** — the same pad opens prefilled; Save replaces that result and rebuilds wins, differential, and standings. **Undo** still clears the last *new* score entry (not a specific court’s correction).
5. **Players** (mid-session): tap **Players** to add late arrivals (0 differential) or **Sit** someone for this/next round (they stay in the session). A highlighted Sit is a bye — system or manual — tap again to unsit and sit someone else. Unscored current rounds regenerate automatically; if scores are in, sit changes apply next round.
6. View **live placement** (wins, differential +/−, games played). Rank is **wins first, differential breaks ties**. Rank changes flash after scores. Settings stay available mid-session.
7. Optional **Switch to King’s Court** finish (confirm): Court 1 is King’s. After each game, winners move up one court, losers move down one; Court 1 winners and Court N losers stay. Partners **split** (teammates become opponents). Seed from current standings (wins, then differential) or shuffle. Same game-to / win-by / sudden death scoring; differential keeps accumulating and King’s Court wins show on the board. Sit-outs rotate at the bottom courts.
8. **End session** for a medal-style final placement. The session is **archived to history by date**. **Undo** reverses the last score entry. The recap mentions a King’s Court finish when you used one.

**Continue session** re-opens the exact scoreboard so you can add more rounds. **Rematch** keeps the same roster/settings with fresh scores.

### Comments & highlight-reel podcast recap

- After a match is scored, tap **Add comment** for courtside color (also optional **round note**).
- When you **End session**, the app builds a **snarky Bangers podcast / highlight-reel** script from scores, standings, sit-outs, and comments.
- **▶ Play preview** uses the browser Web Speech API (quick listen; cannot export a file).
- **Share as text** / Copy / Download `.txt` send the script to Messages, email, etc.
- **Generate audio** / **Share audio** / **Download .mp3** synthesize a real MP3 via the hosted Worker (Pages) or local `/api/tts` (Vite). Script is saved on the session and history entry.

### History

Ended sessions are listed on the home/setup screen (newest first), labeled by local date/time (e.g. `Sep 13 · 2:30 PM`, with `#2` if multiple that day). Tap a row for final placement, **Continue session**, **Rematch**, or **Delete**.

**Placement / differential:** every player earns their team’s score minus the opponent’s (11–5 → +6 / −6). Leaderboard ranks by **games won**, then point differential, then games played / name. Saved sessions that still have match scores are recomputed to differential when loaded (old “banked points” totals are not kept).

Sit-outs / byes are distributed so players with the fewest sit-outs so far sit next.

## Hosted .mp3 recaps (GitHub Pages)

GitHub Pages cannot serve `/api/tts`. After a one-time free Cloudflare Worker deploy, the static site `POST`s `{ text, voice }` to that Worker and gets `audio/mpeg` back. **No paid TTS API.** Voice stays `en-US-AndrewNeural` (Andrew).

### One-time setup (Barry)

1. Create a free [Cloudflare](https://dash.cloudflare.com/sign-up) account (Workers free tier is enough).
2. On a machine with Node, from this repo:

   ```bash
   cd tts-worker
   npx wrangler login          # browser login, first time only
   npx wrangler deploy
   ```

3. Copy the Worker URL Wrangler prints, e.g. `https://bangers-americano-tts.<your-subdomain>.workers.dev` (do **not** add `/tts` unless you want to; the app accepts either).
4. In the GitHub repo: **Settings → Secrets and variables → Actions → Variables** (or **Secrets**) → New →  
   `VITE_TTS_URL` = `https://bangers-americano-tts.<your-subdomain>.workers.dev`
5. Re-run the Pages deploy: **Actions → Deploy GitHub Pages → Run workflow**, or push/merge to `main`. Vite bakes `VITE_TTS_URL` into the client at build time.

The Worker allows CORS from `https://bangerstournify.com`, `https://www.bangerstournify.com`, `https://brantb73.github.io`, and localhost Vite origins (`localhost` / `127.0.0.1`). A CORS failure shows a courtside message on the recap panel.

Optional local override: put `VITE_TTS_URL=https://….workers.dev` in `.env.local` so `npm run dev` hits the Worker instead of `/api/tts`.

Worker endpoints: `GET /health`, `POST /tts` with `{ "text": "...", "voice": "en-US-AndrewNeural" }` → `audio/mpeg`.

## Audio share (real .mp3)

`speechSynthesis` cannot export an audio file. The browser `POST`s JSON `{ text, voice }` expecting `audio/mpeg`:

- **Hosted:** `VITE_TTS_URL` (Cloudflare Worker in `tts-worker/`) when that env is set at build time.
- **Laptop:** same-origin **`POST /api/tts`** Vite middleware that runs **edge-tts** (`.venv`) — `npm run dev` / `npm run preview`.

**Voice:** `en-US-AndrewNeural` (warm conversational US English — podcast host vibe).

### One-time setup (on the machine running Vite)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements-tts.txt   # installs edge-tts
```

Needs network access for edge-tts to reach Microsoft’s TTS endpoint. Leave `VITE_TTS_URL` unset so the UI keeps using `/api/tts`.

### Generate & share

1. On **https://brantb73.github.io/bangers-americano/** after [hosted setup](#hosted-mp3-recaps-github-pages), **or** run **`npm run dev`** / **`npm run preview`** with the local `.venv`.
2. On the recap panel: **Generate audio** → optional in-page player → **Download .mp3** or **Share audio**.
3. On phones that support Web Share with files, **Share audio** opens the system sheet (Messages, etc.). Otherwise the file downloads — attach it yourself (“Audio saved — attach it in Messages”).

Long scripts are capped (~4500 characters) with a truncation note. If TTS fails, the panel shows the error (CORS, Worker down, missing `.venv`, network, etc.).

**Tunnel:** Cloudflare (or similar) to the Vite server keeps `/api/tts` same-origin, so phone clients work without CORS hacks when you are not using the hosted Worker.

## King’s Court finish

During an active Americano session, tap **Switch to King’s Court**, confirm the seed (standings by default, or random), and play the ladder. Mid-session add/leave still works when the current round has no scores (same constraints as Americano). Rematch returns to Americano setup.

**Editing a King’s Court score:** wins, differential, and standings always update. If you’re still on that round, the next ladder uses the corrected winners/losers. If you already advanced and the **next** KC round has no scores yet, that round is rebuilt from the corrected results (standings re-seed for the first KC ladder, or winner/loser movement for later KC rounds). If later KC rounds already have scores, those pairings stay put — only the board updates (a full rewind would wipe those games). A random-seeded first KC round is not reshuffled.

## Stack

- TypeScript · React · Vite
- Unit tests (Vitest) for schedule, scoring/standings, history, share, and TTS helpers
- Hosted TTS: Cloudflare Worker (`tts-worker/`) + `VITE_TTS_URL` on the Pages build
- Dev/preview middleware: `POST /api/tts` via edge-tts (`.venv`)
- Persistence:
  - Active session: `pickleball-americano-session-v1`
  - History: `pickleball-americano-history-v1`
