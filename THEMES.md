# Colour themes (#875)

The app has one colour theme, picked under **Profile → Colours**. It works together with
Light / Dark / Auto: every theme has a light and a dark version.

| id | English name | Persian name |
|---|---|---|
| `default` | Default | پیش‌فرض |
| `paper` | Warm paper | کاغذ کاهی |
| `slate` | Cool slate | خاکستری سرد |
| `forest` | Forest | جنگل |
| `rose` | Rose | گلبهی |
| `contrast` | High contrast | کنتراست بالا |

## How it works

- **Stored** as the app setting `colors` (`chogan.app.settings`), through the core store.
  An unknown or missing value means `default`.
- **Applied before first paint** by `www/lib/early.js`, a small blocking script that every
  page loads right after `lib/chogan.css`. It sets `data-colors` on `<html>` (and
  `data-theme` for a forced light or dark), so a page never shows the default colours for
  a frame and then switches. It is a shared file rather than an inline copy because shared
  code is never copied into a game. **A new game page needs the line**
  `<script src="../../lib/early.js"></script>`; the template has it and a test fails without it.
- **Only neutral tokens change**: `--c-bg`, `--c-bg-tint`, `--c-surface`, `--c-surface-2`,
  `--c-surface-3`, `--c-line`, `--c-text`, `--c-text-dim`, `--c-text-faint`. Accents, game
  colours, `Chogan.inkOn` and `--game-text-dark` are untouched, so every accent keeps the
  contrast it was checked for.
- **Contrast is tested** (`tools/tests/palettes.js`) for every theme in light, system dark
  and chosen dark: text ≥ 4.5:1 on all five surfaces, dim text ≥ 4.5:1 and faint text
  ≥ 3:1 on the page and the two main surfaces. High contrast asks 7:1 for text and dim
  text, 4.5:1 for faint text and 3:1 for lines. Light surfaces stay no darker, and dark
  surfaces no lighter, than limits that keep the accent checks valid.
  `--c-line` is a decorative edge and reaches 3:1 only in High contrast.
- The default light theme's dim and faint text were darkened (#766A5D, #958878) because
  the old values failed: dim was 4.29:1 on `--c-surface-2` and faint was 2.39:1.

## What follows the theme in each game

Every game's **chrome** follows the theme: the game bar, buttons, segments, chips, dialogs,
the result window and the page behind the board. Whether the **board** follows depends on
how the game draws it. Boards were not repainted for this change: game art stays as it was.

How it was measured: each game was loaded at 390×844 with `Math.random` and the date
pinned, once with Default and once with Cool slate, in light and in dark. The board (the
largest canvas, else the largest opaque element covering 10–75% of the screen) was
cropped and the changed pixels counted. Two Default loads gave the noise floor, 0.0% for
all but four games (at most 1.8%, from animation). The dark numbers decide the group,
because the default and slate light surfaces are both near-white and differ little.

- **Follows**: more than 80% of the board changes in dark.
- **Partly**: 5–80%. Usually the board's frame, empty cells or the felt follow, while
  the pieces or cards keep their own colours.
- **Own colours**: under 5%. The board is drawn in its own fixed colours (wood, felt,
  sky, a sports field) and looks the same in every theme.

### Follows

Battleship, Bridges, Chain Reaction, Code Breaker, Doubles, Fit Ten, Flood, Hokm, Jigsaw,
Mancala, Minesweeper, Nine Men's Morris, Nonogram, Number Drop, Pasur, Shelem, Snakes and
Ladders, Way Out.

Flood's crop landed on its note under the board rather than the board, so its group
rests on the screenshots, not the number.

### Partly

Backgammon, Blackjack, Block Drop, Crazy Eights, Dots and Boxes, Echo, Five Dice,
FreeCell, Gin Rummy, Klondike, Ludo, Peak, Peg Solitaire, Spider, Sums.

Klondike and Spider had no board element to crop (their tableau lies on the page), so
they were grouped from the screenshots: the empty slots and the page follow, the cards
keep their own faces and backs.

### Own colours

8-Ball Pool, Air Hockey, Bowling, Breakout, Button Football, Carrom, Checkers, Chess,
Chinese chess, Circuit, Corridor, Crossing, Darts, Dominoes, Four in a Row, Go, Gomoku,
Gorillas, Gridlock, Hex, Hillrider, Hop, Lander, Lights Off, Link Up, Mahjong Solitaire,
Moto Rush, Muncher, Pairs, Ping Pong, Pipeworks, Reversi, Sliding Puzzle, Snooker,
Star Raid, Storekeeper, Tanks, Territories, Tower Defence, Tower Up, Trio, Water Sort,
Wrigglers.

Together with Sudoku below, the three groups cover all 77 games in `www/games.json` on
this branch. Games added later are not in these lists.

### Sudoku: its own themes are the per-game override

Sudoku keeps its six board themes from #874 and ignores the app theme on its board
(0.0% change in dark). Its chrome follows the app theme like every other game.
A game that wants the same kind of override sets its own board colours and leaves the
core tokens alone.

## Adding a theme

1. Add the id to `COLOR_THEMES` in `www/lib/chogan.js` and in `www/lib/early.js`.
2. Add its light, system-dark and chosen-dark blocks, and the matching `.ch-swatch` rules,
   in `www/lib/chogan.css`.
3. Add `colors<Name>` to every locale in `chogan.js`.
4. Add it to `COLOR_CHOICES` in `www/index.html`.
5. Run `node tools/test.js`: the contrast, swatch and locale checks read the list from
   the core, so a missing piece fails there.
