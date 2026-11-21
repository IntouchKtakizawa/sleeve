# Sleeve for iPhone

The iOS app is the same React app as the website. [Capacitor](https://capacitorjs.com) wraps it in a native shell (`ios/`) and adds:

- **Durable storage.** Ratings, shelves, history and theme are mirrored to the app's own storage (`@capacitor/preferences`), so iOS clearing web data can't wipe a collection.
- **Native export.** *Export backup* and *Export CSV* open the iOS share sheet (Save to Files, AirDrop, Mail…). Import uses the Files picker.
- **Haptics** when you save or remove a rating.
- **Edge-to-edge layout** around the notch and home indicator, a status bar that follows the light/dark theme, an app icon and a launch screen.
- **External links** (Apple Music, Spotify) open in those apps or Safari.

The web build (`npm run build:pages` → `docs/`) is unchanged. All native code is in `lib/native.ts` and does nothing on the web.

## Everyday development

```sh
npm ci
npm run build:ios      # builds ios-dist/ and copies it into the Xcode project
npm run ios:open       # opens ios/App/App.xcodeproj in Xcode, then press ▶
```

Run `npm run build:ios` again after every change to the web code.

> **Simulator says "Apple Music search is unavailable"?** That's the Mac's network, not the app. A VPN such as Tailscale can stop the iOS Simulator from reaching Apple's servers (Safari inside the simulator fails too). Pause the VPN, or test on a real iPhone.

---

# Releasing on the App Store

## 1. One-time setup

1. **Join the Apple Developer Program**: <https://developer.apple.com/programs/enroll/>. It costs US$99 a year. Approval can take a day or two. You must be 18+, or a parent/guardian enrols and you are added to their team.
2. **Sign Xcode in to that account**: *Xcode → Settings → Accounts → +*.
3. **Pick your bundle ID.** The project uses `io.github.intouchktakizawa.sleeve`. To change it, edit `appId` in `capacitor.config.ts` **and** *Signing & Capabilities → Bundle Identifier* in Xcode. It can't be changed after the first upload.
4. In Xcode, select the **App** target → **Signing & Capabilities**. Tick *Automatically manage signing* and choose your **Team**.

## 2. Create the app in App Store Connect

<https://appstoreconnect.apple.com> → **Apps → + → New App**

- Platform: iOS · Name: *Sleeve* (if the name is taken, try e.g. *Sleeve – Music Journal*)
- Primary language: English · Bundle ID: the one above · SKU: `sleeve-ios`

## 3. Fill in the listing

| Field | Suggested value |
|---|---|
| Subtitle | Rate songs & albums, 0–10 |
| Category | Music (secondary: Lifestyle) |
| Description | Start from the README feature list |
| Keywords | music,rating,album,review,journal,vinyl,collection,diary,songs |
| Support URL | https://github.com/IntouchKtakizawa/sleeve (or the Pages site) |
| Privacy Policy URL | https://intouchktakizawa.github.io/sleeve/privacy.html (included in `public/privacy.html`; it goes live after you rebuild and push the Pages site) |
| Age rating | Answer "None" to everything. Result: 4+ |
| App Privacy | **Data Not Collected** |
| Price | Free |

**Screenshots:** you need at least one set for the 6.9" iPhone (1320×2868 or 1290×2796). Run the app on the *iPhone 17 Pro Max* simulator and press ⌘S to save screenshots to the Desktop. Upload 3 to 5 of them: Home, Discover, the rating sheet, My collection, Insights.

## 4. Build and upload

1. `npm run build:ios`
2. In Xcode, set the run destination (top bar) to **Any iOS Device (arm64)**.
3. For each release, raise the version under *App target → General*: **Version** (1.0, 1.1, …) and **Build** (1, 2, 3, …). Every upload needs a new Build number.
4. Choose **Product → Archive**. When the Organizer opens, choose **Distribute App → App Store Connect → Upload**.
5. Wait about 10–30 minutes for processing. The build then appears under *TestFlight*.

## 5. Test on a real iPhone (TestFlight)

App Store Connect → **TestFlight** → add yourself under *Internal Testing*. Install the **TestFlight** app on your iPhone and accept the invite. Check search, rating, export/import and the audio previews on real hardware.

## 6. Submit for review

Back on the app's **App Store** tab: choose the build, fill in *App Review Information* (no sign-in is needed; say so), then **Add for Review → Submit**. Review usually takes 1–3 days.

### Review risks to know about

- **Guideline 4.2 (minimum functionality).** Apple rejects apps that are "just a website". Sleeve stores data natively, uses the share sheet and haptics, works offline for your collection, and needs no login. If a reviewer still flags it, reply describing those native features. Adding a home-screen widget or Siri shortcut would strengthen the case.
- **Guideline 5.2 (intellectual property).** The app shows Apple Music/iTunes artwork and 30-second previews via Apple's public Search API, and Spotify metadata via oEmbed. Both are allowed. Keep the "Listen on Apple Music/Spotify" links and don't present the previews as a streaming service.
- **Name/trademark.** Don't use Apple Music or Spotify logos as the app icon or in the name.

## Publishing the privacy page

The privacy policy is in `public/privacy.html`. Rebuild the website with `npm run build:pages`, commit `docs/` and push to `main`. It will then be at https://intouchktakizawa.github.io/sleeve/privacy.html. App Store Connect needs this URL before you can submit.

## Updating later

Change the web code → `npm run build:ios` → raise Version/Build in Xcode → Archive → Upload → submit the new version in App Store Connect.
