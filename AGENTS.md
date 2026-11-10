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
| `npm run lint` | TypeScript check (`tsc --noEmit`) |
| `npm test` | Unit tests (vitest, `tests/`) |
| `npm run build` | Production bundle in `dist/` |
| `npm run test:e2e` | Browser tests (Playwright, `e2e/`): a whole local game and a live room with three phones. Starts the dev server itself |
| `npm run bots -- <ROOM> [count]` | Joins simulated students to a room on the dev server, for load checks and demos |

## How production really works

- **Web app:** static files on Cloudflare Pages at `https://grammarcasino.pages.dev/`. Every push to `main` deploys there, but only after lint, tests and build pass (`.github/workflows/deploy-cloudflare.yml`).
- **Pull requests:** `.github/workflows/ci.yml` runs lint, unit tests, build, the Firestore rules checks and the browser tests on every pull request and every non-`main` branch push. When those pass, it publishes a preview of the branch on Cloudflare Pages and puts the address in the job summary.
- **AI and teacher endpoints:** `functions/api/[[route]].ts` (a Cloudflare Pages Function) calls `dispatchServerlessApi` in `server.ts`. This covers `/api/gemini`, `/api/health` and `/api/teacher-auth/*`. Provider order: Groq first, then Gemini, then the offline sentence bank.
- **Live rooms:** phones and the projector talk through Firestore documents: `rooms/{code}` (the shared table), `rooms/{code}/seats/{clientId}` (each phone's private view) and `rooms/{code}/intents/{clientId}` (what each phone asks for). The WebSocket relay in `server.ts` runs only in local development.
- **Game authority:** the teacher's browser tab. Phones only send intents, and the host must check every one (see `game/intents.ts`).
- **Legacy, awaiting decision D1:** `worker.ts`, `netlify.toml`, `netlify/` and the Electron app (`electron/`). Do not build on them; do not delete them until Thiago confirms.

## Folder map

| Path | What lives there |
| --- | --- |
| `App.tsx` | The host screen and almost all game flow (very large; being split up in a later phase) |
| `components/` | Screens and widgets. `StudentControllerView.tsx` is the phone app, `PlayerBettingCard.tsx` the single-screen seat card, `Tabletop3DOverlay.tsx` the lazy-loaded three.js table |
| `game/` | Pure game rules with no React (package F5): `intents.ts` (what phones may do), `betLimits.ts` (Bet Cap, High Roller), `betValidity.ts` (is a bet ready), `status.ts` (shield, frozen, silenced), `flow.ts` (game over, winner). Change a rule here, not in `App.tsx` |
| `utils/` | Pure helpers: `roundSettlement.ts` (payouts), `multiplayerProtocol.ts` (per-phone views), `soundEngine.ts` (Web Audio synthesis), `sentenceSegments.ts`, and others |
| `services/` | AI client (`geminiService.ts`), offline banks (`fallbackSentences.ts`, `expandedCuratedBank*.ts`), Firebase, room transport (`multiplayerService.ts`) |
| `server.ts` | Dev server plus the serverless API used by the Pages Function |
| `functions/api/` | Cloudflare Pages Function entry |
| `public/models/` | GLB models for the 3D table (byte-pinned by `tests/tabletop3DAssets.test.ts`) |
| `scripts/` | `check-firestore-rules.mjs` (emulator checks), `assets/` (Blender and fallback GLB generators) |
| `tests/` | vitest unit tests |
| `e2e/` | Playwright browser tests. They open the dev server with `?e2e=1`, which serves the six fixed sentences in `utils/e2eContent.ts`, skips every AI call and keeps rooms on the local relay. Add `data-testid` only where a role or label selector is not stable |
| `firestore.rules` | Firestore security rules. They take effect only when pasted into the Firebase console |

## Rules for every change

1. **Never push to `main`.** Work on a branch, open a pull request, and let Thiago merge.
2. **One work package per pull request**, small enough to review in ten minutes. A "move code, change nothing" change must not change behaviour.
3. **Green before and after.** `npm run lint` and `npm test` must pass. Never delete, skip or loosen a test to get green. If a test pins behaviour you deliberately change, update it in the same pull request and say so.
4. **Search, don't trust line numbers.** Files move.
5. **Phones come first on weight.** Nothing only the projector needs (three.js, 3D models, large images) may enter the bundle a phone downloads. Compare `npm run build` chunk sizes in the pull request.
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

### Game modes and elimination
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
- `firestore.rules` only takes effect once published in the Firebase console. Rosters and reports are readable only by the teacher's Google account named in that file.
- To test rule changes, run `scripts/check-firestore-rules.mjs` against the emulator (needs Java; instructions at the top of the file).

## Browser storage keys

| Key | Storage | What it holds |
| --- | --- | --- |
| `grammarCasinoGameState` | local | The saved single game (players, round, settings) |
| `grammar_casino_student_session_v1` | local | A phone's room and seat, for reconnecting |
| `grammar_casino_host_room_v1` | local | The teacher's open live room (code, seats, handled intents), so a reload reopens it for up to 6 hours |
| `grammar_casino_cloud_sentences_v1` | local | Cached cloud sentence bank |
| `grammar_casino_teacher_pin` | session | Teacher PIN unlock (being replaced by a signed token, package R7) |
| `grammar_casino_theme` | local | Light or dark theme |
| `grammar_casino_projector_mode` | local | Projector readability mode |
| `grammar_casino_calm_mode` | local | Calm mode (less motion and sound) |
| `grammar_casino_sfx_volume`, `grammar_casino_sfx_muted` | local | Sound effect volume and mute |
| `grammar_casino_orpheus_voice_v2` | local | Chosen read-aloud voice |
| `grammar_casino_expand_settings_deck` | local | Whether the settings chips are expanded |

## The improvement plan

The work is guided by "Grammar Casino: The Spectacular Plan" (packages F1 to A6, run in small phases). Name the package ID in each pull request title, for example "F2: deploy only after checks pass". The pull request description says what changed for the teacher, what changed for students, and how it was checked.
