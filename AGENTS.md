# Grammar Casino: guide for contributors and AI helpers

Read this before changing anything. It replaces the old notes in `.agent/skills/`.

## What the game is

A classroom EFL grammar game. The teacher's computer drives a projector. Students bet play money on grammar questions: is the sentence valid or flawed, multiple-choice cloze, open cloze, word formation, or key word transformation. They play either on the shared screen (single-screen mode) or on their own phones in a live room (up to 35 phones, joined by QR code or a 4-letter room code). It is live in real lessons, so a broken deploy stops a class.

## Commands

npm is the only package manager. Do not add `bun.lock`, `yarn.lock` or `pnpm-lock.yaml`.

| Command | What it does |
| --- | --- |
| `npm ci` | Install exactly what `package-lock.json` pins |
| `npm run dev` | Express dev server with Vite and the local WebSocket relay, on http://localhost:3000 |
| `npm run lint` | TypeScript check (`tsc --noEmit`), plus strict mode for `game/`, `utils/`, `types.ts` and `constants.ts` (`tsconfig.strict.json`). Keep new code there strict-clean |
| `npm test` | Unit tests (vitest, `tests/`) |
| `npm run build` | Production bundle in `dist/` |
| `npm run size` | After a build, compares gzipped file sizes with `scripts/bundle-baseline.json` and fails past +10% (CI runs it). Run `node scripts/check-bundle-size.mjs --update` when growth is intended, and say why in the pull request |
| `npm run test:e2e` | Browser tests (Playwright, `e2e/`): a whole local game and a live room with three phones. Starts the dev server itself |
| `npm run assets` | Rebuilds `public/models/table.glb` and `room.glb` with Blender's Python module (`pip install bpy`, `scripts/assets/build_table.py`) and renders previews of them with three.js into `docs/previews/` (`scripts/assets/preview.mjs`) |
| `npm run bots -- <ROOM> [count]` | Joins simulated students to a room on the dev server, for load checks and demos |

## How production really works

- **Web app:** static files on Cloudflare Pages at `https://grammarcasino.pages.dev/`. Every push to `main` deploys there, but only after lint, tests and build pass (`.github/workflows/deploy-cloudflare.yml`).
- **Pull requests:** `.github/workflows/ci.yml` runs lint, unit tests, build, the Firestore rules checks and the browser tests on every pull request and every non-`main` branch push. When those pass, it publishes a preview of the branch on Cloudflare Pages and puts the address in the job summary.
- **AI endpoints:** `functions/api/[[route]].ts` (a Cloudflare Pages Function) calls `dispatchServerlessApi` (`server/serverless.ts`, re-exported by `server.ts`). This covers `/api/gemini` and `/api/health`. There is no teacher PIN (decision D3): AI sentences and live rooms are open to everyone, each device has a daily AI allowance (`utils/aiDailyLimit.ts`) and the server a daily limit per address; only cloud saves need the teacher's Google sign-in. Provider order: Groq first, then Gemini, then the offline sentence bank.
- **Live rooms:** phones and the projector talk through Firestore documents: `rooms/{code}` (the shared table), `rooms/{code}/seats/{clientId}` (each phone's private view) and `rooms/{code}/intents/{clientId}` (what each phone asks for). The WebSocket relay (`server/relay.ts`, started by `server.ts`) runs only in local development.
- **Game authority:** the teacher's browser tab. Phones only send intents, and the host must check every one (see `game/intents.ts`).
- **Legacy, awaiting decision D1:** `worker.ts`, `netlify.toml`, `netlify/` and the Electron app (`electron/`). Do not build on them; do not delete them until Thiago confirms.

## Folder map

| Path | What lives there |
| --- | --- |
| `App.tsx` | The host screen and almost all game flow (very large; being split up in a later phase) |
| `index.tsx`, `student/StudentApp.tsx` | Entry point. A link with `?room=CODE` loads only `StudentApp` (the phone app); everything else loads `App`. Keep teacher-only code (the offline bank, PDFs, the 3D table, the cloud vault) out of what `StudentApp` imports; `e2e/phone-inputs.spec.ts` checks it |
| `components/` | Screens and widgets. `StudentControllerView.tsx` is the phone app, `PlayerBettingCard.tsx` the single-screen seat card, `Tabletop3DOverlay.tsx` the lazy-loaded three.js table |
| `game/` | Pure game rules with no React (package F5): `intents.ts` (what phones may do), `betLimits.ts` (Bet Cap, High Roller), `betValidity.ts` (is a bet ready), `status.ts` (shield, frozen, silenced), `flow.ts` (game over, winner), `revealGate.ts` (who is in, may the answer be revealed), `persistence.ts` (bringing old saved games up to date), `ruling.ts` (Undo reveal, Void the hand, Accept this answer too; all re-settle from a snapshot taken just before the reveal). `powerUpCatalog.ts` (plain 12-word description and category of every power-up, ready-made decks Classic/Friendly/Chaos; the default deck stays all 40), `powerUpRules.ts` (which attacks Boomerang reflects, what Guardian Angel clears, who the Wheel bounty skips, who may buy). `setupPrefs.ts` (the last game's setup, saved per browser under `grammar_casino_prefs_v1` when the first hand is dealt, and used for a new class). `report.ts` (the one game report behind the report card, the PDF and the CSV: totals, players, topics, most missed, what to teach next), `spacing.ts` (a second look: when 40% or more of the class misses a hand, a new sentence on the same grammar point is dealt two hands later), `teacherDeck.ts` (the teacher's own sentences, package L4: one per line, `A -> B` for a mistake, `_____ [answer]` for a gap, `[right | three others]` for multiple choice, `(BASE)` for word formation; dealt first and in order by `generateSentence`, decks saved per browser under `grammar_casino_decks_v1` or as a `.grammar-deck.json` file), `answerSplit.ts` (what the class answered this hand, and the "Got it" / "Still confused" counts from phones). Change a rule here, not in `App.tsx` |
| `utils/` | Pure helpers: `roundSettlement.ts` (payouts), `multiplayerProtocol.ts` (per-phone views), `soundEngine.ts` (Web Audio synthesis), `sentenceSegments.ts`, and others |
| `services/` | AI client (`geminiService.ts`), offline banks (`fallbackSentences.ts`, `expandedCuratedBank*.ts`), Firebase, room transport (`multiplayerService.ts`) |
| `server.ts` | Dev server (Vite, the WebSocket relay) and the entry the Pages Function imports (`dispatchServerlessApi`) |
| `server/` | The server's parts (package A1): `runtime.ts` (where it runs, `.env`), `limits.ts` (rate and daily limits, AI cache), `aiProviders.ts` (Groq and Gemini calls), `sentenceSchemas.ts` and `sentenceIntegrity.ts` (what an AI sentence must look like), `aiHandler.ts` (`/api/gemini`), `relay.ts` (the dev-only live-room relay), `serverless.ts` (the Pages Function dispatcher). `tests/serverRoutes.test.ts` checks the routes |
| `functions/api/` | Cloudflare Pages Function entry |
| `public/privacy.html` | The short privacy notice for students and teachers (package A5), linked from the phone join screen. Keep it true: change it when what the game sends or keeps changes |
| `server/providers.ts` | AI providers, measured (package A2): model lists (override with `GROQ_TEXT_MODELS`, `GEMINI_TEXT_MODELS`, `GEMINI_TTS_MODELS`, comma separated), time limits (new sentence 7 s so it beats the game's own 8 s, checks 8 s, speech 10 s, others 12 s), the circuit breaker (3 failures in a minute rest a provider for 5 minutes) and the `X-AI-Meta` header (provider, model, time, tokens, why it fell back) that the host writes to its debug log. `/api/health?deep=1` checks each provider when the server has `HEALTH_CHECK_TOKEN` and the caller sends it as a Bearer token |
| `server/verifyItem.ts` | Every AI sentence is checked before students see it (package L3): the L1 schema, the CEFR level (`checkCefrLevelViolation`), a school-safety word list, no near copy of a sentence already dealt, then a second Groq model (the one that did not write it) answers the item cold without the key. Disagreement means `422 { fallback: true }` and the game deals from its bank. A cloze word the checker also accepts is added to `acceptedAnswers`. Key word transformation gets the rules only. AI items reach the cloud bank only after they were played and not voided (`archivePlayedSentence`) |
| `show/quality.ts` | Quality levels of the 3D table (package V1): Off, Low, Medium, High, chosen in setup ("3D table") or Automatic. A frame-rate guard steps down one level when the median frame over 2 s of animation is above 24 ms, never up during a game; Automatic remembers it per computer (`grammar_casino_quality_v1`). Software WebGL and a lost graphics context turn the table off. `Shift+D` shows draw calls and triangles against the budget. `<html data-quality3d>` holds the level in use |
| `show/tableView.ts`, `components/TableBackdrop.tsx` | Table view (package V2 step 2): on the hand, results and final screens, with the 3D table on, outside Calm mode and at least 1100 px wide, the Blender table and room are drawn behind the interface (`<html data-view="table">`, page background transparent, a veil in the page colour keeps text readable) with the same camera as the chips overlay, so chips land on the felt. It is a still frame: drawn on load, resize, each new screen and every 4 s, nothing in between. Software WebGL, a lost context or missing models fall back to Classic view. In development `?force3d=1` draws it on software WebGL for screenshots. `seatAnchorIndex` maps players to `Seat_Anchor_NN` for later use. Step 3: in Table view up to 8 players sit in one curved row (`arc` on `PlayerTileGrid`, `arcOffset`), and a tossed chip leaves from the player's own tile or betting card (`data-seat-player`, `seatPointFromScreen` in the overlay) |
| `show/pot.ts` | Money you can see (package V3): bet chips stay on the felt in up to 7 even piles (`potSlot`) until the payout, then the same chips fly to each winner's own card (`winnerPlayerIds` on the sweep event) or to the House; capped per tier (`POT_CHIP_CAP`), and they fade if the bets leave without a payout (`potTotal` 0). In Table view the chips overlay draws under the interface (`behindInterface`), and dark-theme text gets a soft shadow. The brass "Pot" plaque (`data-testid="pot-plaque"`) sits beside the bets count. `?force3d=1` also stops the frame-rate guard from stepping the tier down |
| `show/totems.ts` | Props that act (package V4, part): a small totem from `powerup_totems.glb` floats just above a player's tile or card while they are on a 3-hand streak (crown), have a shield, or are frozen (ice). The overlay places them by raycasting the tile's top edge (`totemScreenPoint`, `seatPointFromScreen` at y 0.5), follows scrolling and layout changes (scroll listener plus an 800 ms check), pops them in, and renders only when something changes. Part 2: the dealer's card shoe (`card_shoe.glb`) sits on the far rail beside the dealer tray, and drawing a power-up deals a card from it to the player (`ShoeDealEvent`, `shoeEvent` prop); on the teacher's own screen the power-up dialog covers most of the flight, in rooms it shows in full. Not done yet: targeted power-up projectiles, the 3D wheel |
| `show/director.ts` | The reveal director (package V5, first step): `revealCueSheet` lists the beats of a reveal on the sound and table tracks (`REVEAL_BEATS`: pot sweep 450 ms after the verdict, coin shower 1000 ms, bankrupt sting 1100 ms; all at 0 in Calm mode or with reduced motion), and `playCues` runs them through the App's `later` timers. The pot chips stay on the felt through the RESULTS screen until the sweep takes them. Not done: camera moves and light cues (the backdrop is a still frame), interface cues |
| `utils/firestoreUsage.ts` | Firestore reads and writes made by this device today (package A3), counted in `firebaseService.ts`; the debug log gets each live game's count and a note past 60% of the free daily quota |
| `utils/musicEngine.ts` | The music bed on the teacher's screen (package V6): synthesised lounge music at 92 bpm, scheduled 100 ms ahead, with four layers (lobby, think, tension, celebrate) chosen by the screen. It starts after the first click, never with sound off or in Calm mode, drops to 30% on the results screen and to 35% while a sentence is read aloud, switches to the tension layer in the last 5 seconds of the soonest running turn timer (`secondsLeftOnTimers`, `musicDuckFor`), and has its own volume (0 turns it off) next to the effects volume. Phones never load it |
| `game/ceremony.ts` | The winner's ceremony on game over (package V9): "The vault opens", third, second, then the winner with the fanfare and the 3D coin shower, then the class result line (`classResultLine` in `game/report.ts`). Calm mode, reduced motion and a reload on the final screen skip to the end; the teacher can press Skip. Everything stays in the page while faded, so the buttons never wait. `drawMoment` draws "Save this moment" (nicknames, money, class line) to a PNG. The teacher screen has no HTML confetti (package V10): the 3D coin shower celebrates, and nothing does on table Off |
| Cloud saves (package A6) | Any teacher signed in with a verified Google account keeps rosters and reports in `teachers/{uid}/...`, private to them (`firestore.rules`, checked by `scripts/check-firestore-rules.mjs`). Google sign-in uses a second Firebase app (`teacherAuth`, `teacherDb` in `services/firebaseService.ts`), so the room identity on the teacher's screen stays anonymous and never changes. The shared sentence bank is written only by the emails in `config/owners` (field `emails`, console-only). Old top-level `rosters` and `session_reports` are read-only to owners and copied into their space on sign-in. `firestoreCloudStore` is the `CloudStore` interface for a later move to D1/KV. `.github/workflows/deploy-firestore-rules.yml` publishes the rules on merge when the `FIREBASE_SERVICE_ACCOUNT` secret exists. No teacher email appears anywhere in the code |
| `index.css` motion and projector (package V10) | Motion tokens: `--gc-dur-fast/base/slow` (150/300/600 ms) and `--gc-ease-out/spring`, used as Tailwind `duration-gc-*` and `ease-gc-*` and by the `animate-gc-*` animations; use these, not one-off timings. Projector text grows with the screen only on the table screens (`<html data-screen="table">`, set from the step): 28 px body and at least 56 px sentence at 1080p; setup screens keep the fixed sizes. Projector colours pass AAA 7:1 (tests/projectorContrast.test.ts) |
| `utils/debugLog.ts` | The host's debug log (package A4): last 500 events (screens, hands, rooms, seats dropping, intents ignored, AI fallbacks), Shift+L shows it, Download saves it, a crash offers "Copy details". `APP_VERSION` is the commit and build date from `vite.config.ts` (`__APP_VERSION__`), "dev" in tests. Never log what a student typed |
| `public/models/` | GLB models for the 3D table (byte-pinned by `tests/tabletop3DAssets.test.ts`) |
| `scripts/` | `check-firestore-rules.mjs` (emulator checks), `assets/` (Blender and fallback GLB generators; `build_table.py` makes the table and room of package V2, drawn by Table view) |
| `tests/` | vitest unit tests |
| `e2e/` | Playwright browser tests. They open the dev server with `?e2e=1`, which serves the six fixed sentences in `utils/e2eContent.ts`, skips every AI call and keeps rooms on the local relay. Add `data-testid` only where a role or label selector is not stable |
| `firestore.rules` | Firestore security rules. They take effect once published (console, or the rules workflow on merge) |

## Rules for every change

1. **Never push to `main`.** Work on a branch, open a pull request, and let Thiago merge.
2. **One work package per pull request**, small enough to review in ten minutes. A "move code, change nothing" change must not change behaviour.
3. **Green before and after.** `npm run lint` and `npm test` must pass. Never delete, skip or loosen a test to get green. If a test pins behaviour you deliberately change, update it in the same pull request and say so.
4. **Search, don't trust line numbers.** Files move.
5. **Phones come first on weight.** Nothing only the projector needs (three.js, 3D models, large images) may enter the bundle a phone downloads. `npm run size` compares chunk sizes with the baseline; CI fails past +10%.
6. **The lesson must never stall.** Anything that uses the network or AI needs an offline fallback, and every screen needs a way out for the teacher.
7. **Respect Calm mode** and the system's reduced-motion setting for any new animation, flash or sound.
8. **No real student data.** Nicknames only; no accounts or emails for students.
9. **Ask when the plan is silent.** Product choices belong to Thiago.
10. **Gameplay is fixed.** Keep exactly 40 power-ups. No very significant change to how a hand plays. In single-screen play a player at $0 is out for good; online rooms keep the $150 House Bailout.

## Invariants that must stay true

### Multiplayer security
- **No answer leakage.** While `step === 'IN_GAME'`, `buildAllPlayerViews` must never put `isCorrect`, `correctAnswer`, `acceptedAnswers`, `correction`, `errorPhrase` or `explanation` into a phone's view. Helper power-ups (Scalpel, Grammar Goggles) send only derived hints computed on the host.
- **The host trusts nothing a phone claims.** A power-up target or refund needs a purchase the host recorded. The wheel prize is drawn by the host. A bet cannot change after lock-in or time-up. Names are capped at 20 characters, and only known avatars are accepted.
- **Shared vs private view.** A key goes into `rooms/{code}` only if it is in `SHARED_VIEW_KEYS` and identical for every player. Never add a per-player key (bets, hints, power-ups, notifications) to `SHARED_VIEW_KEYS`.
- **No public relays.** Do not add a broadcast channel that carries per-player views.
- **Seat by name.** A phone from another device asking for a seated name needs the teacher's yes (`SEAT_TAKEOVER_REQUEST`).
- **Never render sentence text as HTML.** Use `components/SentenceText.tsx`.

### Phone screens
- Every field where a student types an answer spreads `ANSWER_INPUT_PROPS` (`utils/answerInputProps.ts`), so a phone never capitalises or autocorrects the answer.
- Every control on the student screens is at least 44 by 44 CSS pixels and nothing scrolls sideways at 320 pixels wide. `e2e/phone-inputs.spec.ts` checks both.

### Teacher controls during a hand (package R8)
- Swap this sentence refunds what each player spent this hand (`refundHandSpending`); Pause holds every timer and makes the host ignore phone intents (only `UPDATE_PROFILE` gets through); Reveal now reveals as if the early-reveal switch were on.
- Undo reveal lasts 10 seconds (`UNDO_REVEAL_MS`) and is gone after any ruling correction. The reveal snapshot is kept in memory only, so a reload ends both Undo reveal and Correct the ruling for that hand.

### Sending less (package R5)
- The host writes the room to Firestore at most twice a second and within 250 ms of the first change (`utils/flushPlan.ts`), pushes to the local relay at most every 100 ms, sends a player's own `history` only at game over, and checks at most 4 corrections with the AI at once.

### Presence (package R2)
- A phone sends a `HEARTBEAT` intent every 20 s while on screen (only the newest is kept in its intent document) and at once when it comes back to the foreground or online; it also keeps the screen awake. The host keeps "last heard" in a ref, not in `mpSeats`, so presence never rebroadcasts the table. A seat silent for 45 s or disconnected is away (`game/presence.ts`): greyed on the projector, counted in the room bar, and it never holds up the reveal (it sits the hand out).
- A phone shows "Locked in" only after the host's view confirms it, shows "Sending…" until then and resends every 3 s. Offline, it shows a full-width banner and cannot lock in.

### One clock for the room (package R3)
- The host stamps every update with `serverNow` when it sends it (Firestore table, local relay views). A phone keeps the last five `serverNow - Date.now()` samples, trusts the largest (`utils/clockSync.ts`) and reads the round deadline on its own clock through it. The host locks the round `LATE_BET_GRACE_MS` (1.5 s) after the deadline, so bets on slow Wi-Fi still count; the phone's own clock decides nothing.

### Saved games (package T5)
- Every save goes through `game/persistence.ts`: `stampSave` writes `saveVersion: 2` and `savedAt`, `readSave` reads versions 1 and 2. Opening an unfinished game saved more than 10 minutes ago offers "Resume" or "Start fresh" (not while a live room reopens by itself).

### Keyboard shortcuts (package T2)
- A shortcut presses the on-screen button marked `data-hotkey="<action>"` (`utils/hotkeys.ts`), so a new control gets its shortcut by adding that attribute, and a shortcut can only do what the screen offers. Keys typed in fields are never taken. While a window is open, only its own buttons count.

### Player names and room order (package R6)
- Every name goes through `utils/nameFilter.ts` (`safePlayerName`): printable, at most 20 characters, English blocklist (a blocked name becomes a friendly one like "Lucky Fox"), unique at the table ("Ana 2"). Phones may change their name only before the first hand.
- A new power-up needs an entry in `game/powerUpCatalog.ts` (description of at most 12 words, category); type checking fails otherwise. Names, effects and the flat price stay in `constants.ts`.
- At game over, "Play again" keeps the players and the room (phones stay seated), resets money and goes to the house rules; "New class" is the old full reset (`handleRestartGame`).
- Typed gap answers (open cloze, word formation, key word) are compared with `normalizeGapAnswer` (`utils/roundSettlement.ts`): case, spaces and curly apostrophes never matter; contractions do. Key every answer lookup with it.
- Phone vibrations go through `utils/haptics.ts` (`haptic(kind)`): it respects the student's own on/off button and the teacher's Calm mode. At the reveal the phone shows "And the answer is…" for 1.2 s (skipped in Calm mode and with reduced motion), then the result, its place and the gap to the next place.
- On the phone, every power-up chip opens `components/PowerUpSheet.tsx` (plain description, who it affects, when it ends). Power-up news is a stack of toasts that fade after 7 s; never put a blocking window in front of the betting card.
- Phone wording lives in `strings/en.ts`, read with `t(key, vars)`: plain A2 English, 12 words or fewer per message (a test checks), no "wager" or "bankroll". English only: never add a second dictionary. Put new phone messages there; older phone text is moved there as it is touched.
- The 3D table (`components/Tabletop3DOverlay.tsx`) stays off where WebGL is drawn in software (`isSoftwareRenderer`), which includes headless Chromium in the browser tests. There it froze the screen for seconds after a reload and made the tests flaky.
- `npm run audit:content` prints the bank coverage grid (type by level by topic) and the cross-item checks (`content/audit.ts`: near-duplicates, a distractor that is also an accepted answer, a backwards word formation). `tests/contentAudit.test.ts` keeps the bank at zero problems. Thin cells are listed, not failed, until the bank is filled.
- Every sentence passes `validateItem` (`content/schema.ts`): the built-in bank with no warnings (`tests/contentSchema.test.ts`), AI sentences with no errors before they are dealt (a failing AI sentence is replaced by a bank one). The bank (`services/fallbackSentences.ts`) is loaded with `import()` only when needed; keep it out of static imports. Key word marking lives in `utils/kwtMarking.ts`.
- The phone must not import `utils/roundSettlement.ts` (it pulls in the AI service and grows the phone bundle).
- A room holds at most 40 seats. A phone the teacher removes cannot join that room again: the host bans its client id and Firebase id, and the phone remembers the room for 12 hours (`grammar_casino_removed_rooms_v1`).

### Game modes and elimination
- A new game starts in `rounds` ("Most money after N hands", package G3); saved games keep their own mode.
- Single-screen play: a player at $0 is bankrupt and out for good in every mode (package G9). They stay visible with a "Bankrupt" tag. The Second Chance power-up gives $300 at settlement when a balance would hit $0; it never rescues a player already at $0. Bets of $0 stay valid; there is no ante.
- `lastPlayer`: play until one solvent player remains. The $150 House Bailout never applies here, even in a room (`isBailoutEnabled` in `game/flow.ts`). When the game ends and who wins is decided only in `game/flow.ts`.
- `rounds` and `targetAmount`: in a live room, a bankrupt player gets the $150 House Bailout at the start of the next hand.

### Power-up compatibility (`constants.ts`)
- `CLOZE_DISABLED_POWER_UPS`: Grammar Goggles and Correction Bounty are off on non-binary hands.
- `BINARY_DISABLED_POWER_UPS`: Scalpel only works on multiple-choice and cloze hands.
- `MP_ONLY_POWER_UPS`: Peekaboo only exists in a live room.
- `NON_OFFENSIVE_TARGETED_POWER_UPS`: Peekaboo and Copycat do not count toward the one-attack-per-target-per-hand limit. Copycat ignores Shield and Guardian Angel.
- Boomerang stays hidden on target lists and reflects offensive power-ups. Swap against a richer Boomerang holder costs the attacker 25% instead.
- High Roller and Bet Cap cancel each other on the same target.
- Swap cannot be refunded, except when no player can be targeted.
- Settlement is two-pass (`utils/roundSettlement.ts`). Personal multipliers come first; Copycat and Blood Pact use the first-pass snapshot.

### Content
- The offline bank keeps the chosen CEFR level as long as possible and switches topic first (`pickKeepingLevel`). `tests/curatedBank.test.ts` checks every offline item; run it after editing the bank.
- Use the official `@google/genai` SDK, never `@google/generative-ai`.

### Projector mode
- The projector button toggles the `projector` class on `<html>`. Its readability rules are an explicit list in `index.css` (search for `html.projector`). If you add a translucent text class (`text-<colour>/<alpha>`), add a matching projector rule.

### Firestore
- `firestore.rules` takes effect once published (Firebase console, or `.github/workflows/deploy-firestore-rules.yml` on merge when the `FIREBASE_SERVICE_ACCOUNT` secret exists). Each teacher's rosters and reports live in `teachers/{uid}` and are readable only by that Google account; bank owners are listed in the console-only document `config/owners`.
- To test rule changes, run `scripts/check-firestore-rules.mjs` against the emulator (needs Java; instructions at the top of the file).

- AI requests carry the sentence and typed answers only, never a nickname, seat or other identifier (`tests/privacy.test.ts`).
- `.github/workflows/morning-check.yml` checks the live site every weekday at 06:30 Sao Paulo time and opens an issue if it fails. It runs from `main` only.

## Browser storage keys

Read and write them through `safeLocalStorage` / `safeSessionStorage` (`utils/safeStorage.ts`), never `localStorage` directly: some browsers refuse storage and throw, and `e2e/blocked-storage.spec.ts` checks the game still runs then.

| Key | Storage | What it holds |
| --- | --- | --- |
| `grammarCasinoGameState` | local | The saved single game (players, round, settings) |
| `grammar_casino_student_session_v1` | local | A phone's room and seat, for reconnecting |
| `grammar_casino_removed_rooms_v1` | local | Rooms this phone was removed from in the last 12 hours (package R6) |
| `grammar_casino_host_room_v1` | local | The teacher's open live room (code, seats, handled intents), so a reload reopens it for up to 6 hours |
| `grammar_casino_finished_games_v1` | local | Reports of the last 20 games finished on this computer (package T5) |
| `grammar_casino_cloud_sentences_v1` | local | Cached cloud sentence bank |
| `grammar_casino_ai_daily_v1` | local | Today's AI calls on this device (sentences and other calls), for the daily AI limit |
| `grammar_casino_firestore_usage_v1` | local | Today's Firestore reads and writes from this device (an estimate) |
| `grammar_casino_own_deck_v1` | local | The teacher's own sentences in use (L4) |
| `grammar_casino_decks_v1` | local | Saved decks of the teacher's own sentences (L4) |
| `grammar_casino_quality_v1` | local | 3D table quality: the teacher's choice and what Automatic learned |
| `grammar_casino_cloud_moved_v1` | local | The Google uid whose old shared rosters and reports were already copied into their private space (package A6) |
| `grammar_casino_music_volume_v1` | local | Music volume (0 = off) |
| `grammar_casino_theme` | local | Light or dark theme |
| `grammar_casino_projector_mode` | local | Projector readability mode |
| `grammar_casino_calm_mode` | local | Calm mode (less motion and sound) |
| `grammar_casino_sfx_volume`, `grammar_casino_sfx_muted` | local | Sound effect volume and mute |
| `grammar_casino_orpheus_voice_v2` | local | Chosen read-aloud voice |
| `grammar_casino_expand_settings_deck` | local | Whether the settings chips are expanded |

## The improvement plan

The work is guided by "Grammar Casino: The Spectacular Plan" (packages F1 to A6, run in small phases). Name the package ID in each pull request title, for example "F2: deploy only after checks pass". The pull request description says what changed for the teacher, what changed for students, and how it was checked.
