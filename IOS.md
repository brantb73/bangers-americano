# Tournify on your iPhone

This is the Mac setup for the Tournify iPhone app. The website at [https://bangerstournify.com](https://bangerstournify.com) stays as it is. The phone app is the same scoreboard, stored on the phone, with a real audio recap you can play and send.

You will use your iMac or Mac mini for the Xcode steps. A Windows PC cannot build this.

The bundle id is `com.brantb73.tournify`. To use a different one, change `appId` in `capacitor.config.ts` (that is the only place), then run `npm run ios:sync` again before you open Xcode.

## What this app adds on iPhone

- The whole app is inside the install. It does not load the website, and it works with no signal.
- **Create audio recap** speaks the script with the iPhone’s own voice and saves an audio file. Play it in the app, or send it with the share sheet (Messages, Mail, and so on).
- **Share as text** and **Share** on Export/Import use the same share sheet.
- A light tap when you save a score, swap two players, or sit someone.
- The screen stays awake during an active session.
- The layout clears the notch and the home indicator.

Sessions saved in the app are **not** the sessions in Safari on bangerstournify.com. Use Export/Import to move a backup between them.

For a warmer voice, on the iPhone open **Settings → Accessibility → Spoken Content → Voices → English**, and download an **Enhanced** or **Premium** voice (Ava, Zoe, or Samantha are good). The app uses the best US English voice that is already downloaded, and falls back to the built-in voice if you have not downloaded one.

## 1. Join the Apple Developer Program

1. On the Mac, sign in at [https://developer.apple.com/programs/enroll/](https://developer.apple.com/programs/enroll/) with the Apple ID you want on the app.
2. Enroll as an **individual** (not a company).
3. Wait until Apple emails that the membership is active. You can install the app on your own phone before that, but you cannot upload to the App Store until it is active.

## 2. Install Xcode and Node

1. Open the **App Store** on the Mac and install the latest **Xcode**. Open Xcode once and let it install the extra components. If it asks, agree to the license.
2. In Xcode, open **Settings → Locations** (older Xcode says Preferences) and set **Command Line Tools** to the Xcode you just installed.
3. Install **Node.js 22 or newer** from [https://nodejs.org](https://nodejs.org) (the LTS download). Quit and reopen Terminal after it finishes.
4. Check both:

```bash
node -v
xcodebuild -version
```

`node -v` should start with `v22` or higher.

## 3. Get the project onto the Mac

In Terminal:

```bash
git clone https://github.com/brantb73/bangers-americano.git
cd bangers-americano
npm install
npm run ios:sync
npm run ios:open
```

`ios:sync` builds the website files and copies them into the Xcode project. Do this again any time you pull new code, before you Archive.

`ios:open` opens `ios/App/App.xcodeproj`. Use that. There is no CocoaPods workspace.

The first open will download Apple’s Swift packages (Capacitor and the speech plugin). Leave Xcode on the network until the package spinner finishes. If it says a package failed, use **File → Packages → Reset Package Caches**, then **Resolve Package Versions**.

## 4. Sign the app

1. In Xcode, open **Settings → Accounts**, click **+**, and sign in with the same Apple ID.
2. In the left sidebar, click the blue **App** project, then the **App** target (under TARGETS).
3. Open **Signing & Capabilities**.
4. Check **Automatically manage signing**.
5. **Team**: choose your name (Personal Team is enough to run on your own phone; the paid Developer team is required to upload).
6. **Bundle Identifier** should read `com.brantb73.tournify`. If you change it, change `appId` in `capacitor.config.ts` and run `npm run ios:sync` so Xcode does not get overwritten the next time you sync.

## 5. Run it on your iPhone

1. Plug the iPhone into the Mac with a cable. Tap **Trust** on the phone.
2. On the phone, if you see **Settings → Privacy & Security → Developer Mode**, turn it on and reboot when asked. That row often appears only after the first Xcode install attempt.
3. At the top of Xcode, set the run destination to your iPhone (not a simulator).
4. Press the **Run** button (the play triangle), or **Product → Run**.
5. If the phone says the developer is not trusted: **Settings → General → VPN & Device Management**, tap your Apple ID, and tap **Trust**.

Then try:

- Add players, start, enter a score (you should feel a light tap), swap two names, and sit someone.
- **End session**, then **Create audio recap**. When it finishes, press play on the audio bar, then **Share audio** and send it to yourself in Messages.
- On the home screen, **Share full backup** and AirDrop or save the JSON. That file imports on the website, and a website export imports here.

## 6. Archive and upload

Do this only after the Developer Program membership is active.

1. At the top of Xcode, set the destination to **Any iOS Device (arm64)**. Archive is disabled if a simulator is selected.
2. **Product → Archive**. Wait until the Organizer window opens.
3. Select the new archive and click **Distribute App**.
4. Choose **App Store Connect** → **Upload**.
5. Leave the defaults (upload symbols, manage signing automatically) and finish the prompts.
6. Xcode will say the upload succeeded. Processing on Apple’s side takes a while. You will get an email when the build is ready.

The project already answers the encryption question (`ITSAppUsesNonExemptEncryption` is false). If App Store Connect still asks, choose **No**, the app does not use non-exempt encryption. It only uses normal HTTPS inside the system web view, and the recap never leaves the phone unless you share it.

## 7. TestFlight

1. Open [https://appstoreconnect.apple.com](https://appstoreconnect.apple.com).
2. **Apps → + → New App**.
   - Platform: iOS
   - Name: **Tournify**
   - Primary language: English (U.S.)
   - Bundle ID: `com.brantb73.tournify` (register it if it is not in the list: **Certificates, Identifiers & Profiles → Identifiers → + → App IDs**, explicit, that bundle id)
   - SKU: `tournify` (any private id you will not change)
   - User access: full
3. When the uploaded build appears under **TestFlight**, open it.
4. If it asks about export compliance, answer **No**.
5. **Internal testing** (you, on your Apple ID) does not need a review. Install **TestFlight** from the App Store on the iPhone, accept the invite, and install Tournify.
6. External testers need a short Beta App Review. Add them under an external group after the internal install looks right.

## 8. App Store listing checklist

Fill these in under the app’s **App Store** tab, then pick the build and submit.

| Field | What to enter |
| --- | --- |
| Name | Tournify |
| Subtitle | Americano pickleball sessions |
| Category | Sports |
| Price | Free |
| Privacy Policy URL | `https://bangerstournify.com/privacy.html` |
| Support URL | `https://github.com/brantb73/bangers-americano` |
| Marketing URL | `https://bangerstournify.com` |
| Copyright | 2026 BANGERS |

The privacy page is part of this project (`public/privacy.html`). It is on the live site after this work is merged to `main` and the GitHub Pages workflow finishes. Open the URL in a browser before you submit. If it 404s, wait for that deploy.

### Description (paste and edit)

```
Tournify by BANGERS runs a recreational doubles Americano on your iPhone.

Add the players, set the courts and the score (first to 11, win by 2, or whatever you play). The app rotates partners, tracks point differential, and shows live standings. Sit someone out, send them home for the night, or swap the lineup before the game starts. When the mixer is done, switch to King’s Court: winners move up, losers move down, partners split.

End the night and Tournify writes a snarky highlight-reel recap. On iPhone it turns that script into an audio file with the phone’s own voice — no account, no upload — so you can play it back or drop it in the group chat. Share the script as text, or export the whole night as a file.

Everything stays on this iPhone. There is no login and no tracking. To move a session to or from bangerstournify.com, use Export/Import.
```

### Keywords

100 characters max, commas, no spaces. This fits:

```
pickleball,americano,doubles,scoring,standings,kings court,recap,mixer,ladder,bye
```

### Screenshots

The app is iPhone only, portrait. App Store Connect wants screenshots for the largest iPhone size and scales them down.

Take them in the Simulator if you do not want to photograph the phone:

1. Xcode → **Open Developer Tool → Simulator**.
2. **File → Open Simulator** and pick the newest **iPhone Pro Max**.
3. Run Tournify on that simulator (**Product → Run** with the simulator selected). Set up a full-looking session first (8 names, a few scores, then the recap).
4. **File → Save Screen** (or Cmd-S). Files land on the Desktop.

As of 2026, Connect accepts these portrait sizes. Start with the first one. If it rejects the file, it tells you the exact size to use.

- 6.9-inch (required for new apps): **1320 × 2868** or **1290 × 2796**
- 6.7-inch, if it still asks: **1290 × 2796**
- 6.5-inch, if it still asks: **1284 × 2778** or **1242 × 2688**

Useful shots: the home screen with the roster, a live round with scores, standings, and the recap with the audio player. Three to five is enough. You do not need iPad screenshots.

The app icon is already in the Xcode project (1024×1024, no transparency, background `#05070a`). You do not upload the icon separately.

### Age rating

Answer **None** for every content question (violence, sexual content, profanity, horror, gambling, alcohol, and the rest). The recap teases; it does not use profanity.

Also:

- Unrestricted web access: **No**
- Gambling or contests: **No**
- User-generated content shared with other people inside the app: **No** (comments stay on the phone; sharing uses the normal iOS share sheet)

That should land on **4+**.

### Privacy label

**App Privacy → Get Started → Data Not Collected.**

That matches the app: names and scores stay in on-device storage, the audio file is created on the phone, and nothing is sent to Tournify. There is no tracking.

### Review notes (paste into App Review Information)

```
No account. Sample path: open the app, add four names, tap Start, enter a score on each court, tap End session, then Create audio recap. The audio is generated on the device with Apple’s speech synthesizer and is not uploaded. Share audio opens the system share sheet. All session data stays on the device (local storage). The app does not load a remote website.
```

Sign-in information: leave blank.

## 9. Submit

1. On the App Store version page, attach the processed build.
2. Fill in the screenshots, description, privacy URL, age rating, and App Privacy.
3. **Add for Review**, then **Submit to App Review**.

Apple emails you if they need a change, or when it is approved. After approval, click **Release** if you did not choose automatic release.

## If something goes wrong

- **Blank app or old UI:** run `npm run ios:sync` again, then Run. The phone shows the last files copied into Xcode, not the website.
- **Signing error:** Signing & Capabilities → Team. The bundle id must match `appId` in `capacitor.config.ts`.
- **Speech plugin missing / “not implemented”:** `npm run ios:sync`, then in Xcode **File → Packages → Resolve Package Versions**. The speech code is `plugins/speech-file`.
- **Audio sounds robotic:** download a Premium or Enhanced English voice (see the top of this file).
- **“Speech took too long”:** the script is very long. Shorten it in the recap box and try again.
- **New version later:** in the App target, **General**, raise **Build** (required for every upload) and **Version** when you want a new number on the store (1.0, then 1.1). Then Archive again.
- **Regenerate the icon** after a logo change, from the project folder:

```bash
cp public/tournify-logo.png assets/logo.png
npx @capacitor/assets generate --ios \
  --iconBackgroundColor '#05070a' \
  --iconBackgroundColorDark '#05070a' \
  --splashBackgroundColor '#05070a' \
  --splashBackgroundColorDark '#05070a' \
  --logoSplashScale 0.4
```

The icon must stay a solid 1024×1024 PNG. Do not leave transparent pixels. `#05070a` is the app background.

## What was already checked

On the machine that prepared this project: `npm test`, `npm run build`, and `npx cap sync ios` succeeded. The app icon was checked to be 1024×1024 with no transparency and a `#05070a` background. GitHub Pages still builds with Vite `base: '/'`.

Xcode was **not** available there, so the Swift speech plugin was not compiled and the app was not launched in the Simulator. The first **Product → Run** on your Mac is the real compile. If Xcode reports a Swift error in `SpeechFilePlugin.swift`, that file is the one to look at.
