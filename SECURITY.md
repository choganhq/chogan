# Security policy

Chogan has no server, no accounts and no network access: the games run entirely on the device, and progress stays in the browser's or the app's local storage. The Android app asks for no permission but vibration. So the things worth reporting are in the app itself and in how it is built and published.

## What to report

- A way for a web page, a shared link or a file to run code inside the app or read its saved data.
- A problem in the Android build: a permission, an exported component, the WebView's settings.
- Anything that would let someone ship a changed APK or web build under our name: the signing, the release workflow, the F-Droid reproducible build, the GitHub Pages deploy.
- A dependency with a known vulnerability that reaches the shipped app.

Game bugs, cheats for the daily challenge or the league, and wrong scores are ordinary issues; please open them in the [issue tracker](https://github.com/choganhq/chogan/issues).

## How to report

Please report privately, not in a public issue:

- **GitHub:** [report a vulnerability](https://github.com/choganhq/chogan/security/advisories/new) (Security tab → Report a vulnerability).
- **Email:** choganhq@gmail.com

Any language is fine. Say what you found, how to reproduce it, and which version you tested (the profile page shows it, or <https://choganhq.github.io/chogan/version.js> for the web).

## What happens next

This is a hobby project kept by one person, so there is no fixed response time; expect a reply within a week. A confirmed problem is fixed on the web as soon as the fix is merged and in a new Android release straight after, and you are credited in the changelog unless you would rather not be.

## Supported versions

Only the latest release. The web version is always the latest; on Android, please update before reporting.
