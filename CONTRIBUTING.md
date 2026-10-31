# Contributing to Chogan

Thank you for helping. Chogan is a set of small, finishable games in one free, offline app, with no ads, no tracking and no permission but vibration. Contributions that fit that are welcome.

## Before you start

- **Open an issue first**, or comment on one, for a new game or a large change. A new game's name, rules and look are decided with the owner; a pull request for a game nobody has agreed to may be closed even if it is good.
- **New games** follow [NEW_GAME.md](NEW_GAME.md) (Persian): a folder from `template/game/` under `www/games/`, an entry in `www/games.json`, its awards in `www/lib/chogan.js`, a row in each README table, a line in each of the five store descriptions under `fastlane/metadata/android/`, and a `testYourGame()` group in `tools/test.js`.
- **No new dependencies, servers or permissions.** Plain JavaScript on a canvas or the DOM, everything inside the package. Network access, even on a local network, is out of scope (#185).

## Checks

Run both before opening a pull request:

```bash
node tools/test.js        # engines, metadata, guards; must end with "همه‌ی … بررسی سبز"
tools/browser-check.sh    # every page loads without console errors (needs Chrome)
```

`tools/test.js` runs every function named `testSomething()` by itself, so a new group needs no extra line anywhere else. A group that runs no check fails the run.

## Merge conflicts

Several files are shared by every new game: `www/games.json`, the awards in `www/lib/chogan.js`, the README tables, the store descriptions and `tools/test.js`. When two games are added at once, the second pull request will usually conflict in these lists. **You don't need to keep rebasing:** leave the conflict, and the maintainers resolve it when they merge, keeping your commit and your name. Please don't change `MIN_CHECKS` in `tools/test.js`; it is a floor that is raised at release time.

## Style

- Commit messages, pull requests and code comments in English; the game's text in all six languages (Persian, English, Simplified Chinese, German, Spanish, Polish).
- Comments say why, not what.
- A pull request says what changed, how it was tested, and what was not tested.

## Conduct and security

Everyone taking part follows the [code of conduct](CODE_OF_CONDUCT.md). Security problems are reported privately, as [SECURITY.md](SECURITY.md) explains, not in a public issue.
