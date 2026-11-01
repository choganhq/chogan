# Product

<!-- impeccable:product-schema 1 -->

This record was written on 2026-11-01 without an interview, while the owner was away. Facts taken from the repository or from decisions the owner has already recorded are stated plainly. Anything the agent inferred is marked *(inferred, owner to confirm)*.

## Platform

web

One `www/` folder ships as a PWA on GitHub Pages and, wrapped in Capacitor, as the Android app (GitHub Releases, F-Droid, Google Play). The Android build uses the same web UI, so its design language is the web one, not native Material.

## Users

- Players on a phone who want a short game they can finish in 5 to 15 minutes, offline, with no ads and no tracking. Touch comes first and the keyboard second.
- Persian speakers first: Persian is the first UI language, and English the second. Chinese, German, Spanish and Polish are also supported. Persian means right-to-left layout.
- Friends and family playing together on one phone: many games offer two players (or up to four) on the same device. The menu can filter games for this.
- Open-source and F-Droid users who choose apps for privacy and reproducible builds *(inferred, owner to confirm)*.

## Product Purpose

Chogan is one free, open-source app that holds a growing catalogue of small 2D games: classic board, card, puzzle and arcade games, plus Persian games such as Pasur, Hokm and Shelem. New games ship as updates to the same app. Success means a player finishes a session feeling they completed something, not that their time was taken.

## Positioning

- Fully offline. The Android app declares only the vibration permission, not even internet access.
- No ads, no in-app purchases, no analytics, no tracking. MIT licensed, with reproducible F-Droid builds.
- A daily challenge that is identical on every device, with no server.
- Persian-first, including Persian card games and our own Qajar-style card art.

## Operating Context

- Mostly phones in portrait, sometimes landscape. Tablets, a 7-inch phone and desktop browsers are also used. Boards fill the available screen with no fixed pixel caps.
- Used in short sessions, often offline. Progress is stored only on the device (`localStorage`); Android auto-backup is off.
- Features around the games: a daily challenge, a weekly offline league with five tiers, more than 150 achievements, coins, statistics and a profile, "recently played", pinned games, a "new games" row, search and a players filter.
- Light and dark themes, plus following the system theme.

## Capabilities and Constraints

- Plain JavaScript on canvas or DOM, usually one HTML file per game under `www/games/<id>/`. No framework and no build step for the web.
- A shared core in `www/lib/chogan.js` and `www/lib/chogan.css` provides storage, translations, sound, coins, awards, league, daily challenge and UI parts. Anything shared lives there and is never copied into a game.
- No backend, no database, no account. No new Android permissions, ever: that is the main selling point (decided 2026-10-11).
- Every game and string exists in all six languages. The `LOCALES` table is the single list of languages.
- A game's options live behind a gear, never inside the «?» help.
- Sounds are synthesised in code (WebAudio). No audio files.
- Trademarked names are avoided: Block Drop (not Tetris), Echo (not Simon), Lights Off (not Lights Out), Corridor (not Quoridor), Ping Pong (not Pong).
- No addictive mechanics: no waiting timers, no buyable currency, no gacha.

## Brand Commitments

- Name: «چوگان» / Chogan. Package `io.github.choganhq.chogan`, which never changes. Contact address choganhq@gmail.com.
- Game names are the owner's call. For example, «فری‌سل» stays as it is.
- All art is our own, drawn in code: card faces, card backs (carpet and termeh), jigsaw pictures, and Mahjong flower and season tiles. No stock, third-party or AI-generated art.
- Each game has its own accent colour, and text on it must reach 4.5:1 contrast in light and dark themes (`Chogan.inkOn`, `--game-text-dark`).
- Tone: warm and plain *(inferred, owner to confirm)*.

## Evidence on Hand

- 50 games listed in `www/games.json`.
- Store text and phone screenshots in six languages under `fastlane/metadata/android/`.
- Release notes are posted to the Telegram channel @chogan_games.
- Contributors from the community: Gomoku, Way Out, Gridlock, Chinese chess, and the Polish translation.
- There are no testimonials, reviews, download counts or press. Never invent them.

## Product Principles

1. Short and finishable beats endless and sticky.
2. Offline and private by construction, not by policy.
3. Persian first, and every language complete.
4. Simple and low-maintenance wins: no servers, no paid services, no heavy dependencies.
5. Touch first: big targets, nothing that moves under the finger between two taps.

## Accessibility & Inclusion

See `ACCESSIBILITY.md`. In short:

- Supported: right-to-left layout, light and dark themes, `prefers-reduced-motion`, switches for sound and vibration, no time limit in most games, keyboard play, a colour-blind-friendly Code Breaker, and contrast checks on game accents.
- Known limits: canvas boards are not readable by screen readers, and the viewport blocks pinch zoom.
