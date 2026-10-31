---
name: grammar-casino-architecture
description: Project architecture, multi-runtime parity rules, multiplayer security invariants, power-up mechanics, and Gemini SDK guidelines for Grammar Casino. Read this skill before modifying game logic, power-ups, AI prompts/schemas, or multiplayer synchronization.
---

# Grammar Casino — Architecture & Invariants Skill

Use this skill whenever you are adding features, modifying power-ups, refactoring components, or updating AI/multiplayer endpoints in **Grammar Casino**.

---

## 1. Multi-Runtime Parity (Web / Netlify / Electron Desktop)

Grammar Casino runs across three targets from the same codebase:
1. **Express Dev & Full-Stack Server**: `/server.ts`
2. **Netlify Serverless Functions** (Production Web): `/netlify/functions/` (`gemini.ts`, `mp.ts`)
3. **Electron Windows Desktop App**: `/electron/main.cjs` & `/electron/preload.cjs`

### Rules:
* **AI Prompts & Schemas**: The core Gemini prompts, response schemas, and provider abstractions live in `/services/aiPrompts.ts` and `/services/geminiService.ts`. If you change an action (`generateSentence`, `verifyCorrection`, `verifyOpenClozeBatch`, `getHint`, `simplifyExplanation`, `generateSpeech`) or its payload, ensure `/server.ts`, `/netlify/functions/gemini.ts`, and `/electron/main.cjs` stay in sync.
* **Offline Curated Bank Parity**: When the Teacher PIN is locked (or the device is offline), `/services/geminiService.ts` routes all requests to `/services/offlineService.ts` (`0` API calls). Every challenge format (`binary`, `multipleChoice`, `openCloze`) and feature must degrade gracefully to `/services/offlineService.ts`.
* **Offline Bank Fallback Order**: `getCuratedSentence` in `/services/fallbackSentences.ts` uses `pickKeepingLevel`, which keeps the chosen CEFR level for as long as possible and switches topic first when the bank runs dry. When the topic is switched, the returned sentence carries `bankTopic` and the table badge shows "This hand: <topic>".
* **Bank Quality Checks**: `npm test` runs `/tests/curatedBank.test.ts` over every offline item (KWT key word must not appear in the first sentence, answers 2–6 words and scored 2 marks by the offline marker, MC answer among unique options, no stray mid-sentence capitals in flawed sentences). Run it after adding or editing bank items.
* **Teacher PIN Security**:
  * Never hardcode a default fallback PIN in `/server.ts`, `/netlify/functions/gemini.ts`, or `/services/geminiService.ts`.
  * If `TEACHER_PIN` is not configured on the server, `/api/teacher-pin/status` and `/api/gemini` must refuse live AI mode (`pinConfigured: false`) and keep the client in free Offline Curated Mode.
  * Never commit `.teacher-pin.json` or `.env` files.

---

## 2. Live Classroom Multiplayer & Zero Answer Leakage

Multiplayer supports up to 35 concurrent student phones via QR code / 4-letter Room Code (`/services/multiplayerService.ts` + `/utils/multiplayerProtocol.ts` + `/components/StudentControllerView.tsx`).

### Rules:
* **Host-Authoritative State**: The teacher's projector session (`/App.tsx`) is the single source of truth. Student phones send lightweight `StudentIntent` events (`SET_BET`, `SET_FULL_BET`, `LOCK_IN`, `BUY_HINT`, `BUY_RANDOM_POWER_UP`, `SELECT_POWER_UP_TARGET`, `CANCEL_POWER_UP_TARGET`, `APPLY_WHEEL_RESULT`, `UPDATE_PROFILE`).
* **Zero Answer Leakage (`IN_GAME`)**:
  * In `/utils/multiplayerProtocol.ts` (`buildAllPlayerViews`), **never** include `isCorrect`, `correctAnswer`, `acceptedAnswers`, `correction`, `errorPhrase`, or `explanation` in `PlayerViewPayload.sentence` while `step === 'IN_GAME'`.
  * Power-ups that assist with the question (such as `SCALPEL` or `GRAMMAR_GOGGLES`) must compute derived, non-leaking hints on the host (`scalpelHint.eliminatedOptions` or `scalpelHint.clozeMask` showing only first letter + underscore mask + length) and pass only that derived hint in `PlayerViewPayload`.
* **Single-Screen + Mobile Parity**: Every gameplay mechanic, bet constraint (`BET_CAP`, `HIGH_ROLLER`), and power-up UI must work in **both** `/components/PlayerBettingCard.tsx` (Single-Screen / Projector Full Cards view) and `/components/StudentControllerView.tsx` (Mobile Controller view).

---

## 3. Game Modes & Elimination Rules

Grammar Casino has three victory modes (`GameMode` in `/types.ts`):
1. `'lastPlayer'` (**High-Roller Survival**): Play until only one solvent player (`money > 0`) remains.
   * **CRITICAL**: Automatic `$150` House Bailout (`HOUSE_BAILOUT_AMOUNT`) must **never** trigger in `'lastPlayer'` mode, even when `mpRoomCode` is active (`const isBailoutEnabled = Boolean(mpRoomCode) && gameMode !== 'lastPlayer'`). Otherwise, players can never be eliminated and the game will never end.
2. `'rounds'` (**Fixed Shoe Hands**): Richest vault after `totalRounds` hands. In Live Multiplayer (`mpRoomCode`), bankrupt players receive a `$150` House Bailout at the start of the next hand so they can keep participating.
3. `'targetAmount'` (**Target Bankroll**): First player to reach or exceed `targetAmount` wins. In Live Multiplayer (`mpRoomCode`), bankrupt players receive a `$150` House Bailout at the start of the next hand.

---

## 4. Challenge Formats & Power-Up Compatibility

There are 3 question types (`QuestionType`: `'binary' | 'multipleChoice' | 'openCloze'`), plus `'mixed'` rotation:
* **Cloze-Disabled Power-Ups** (`CLOZE_DISABLED_POWER_UPS` in `/constants.ts`):
  * `GRAMMAR_GOGGLES` and `CORRECTION_BOUNTY` are disabled on `multipleChoice` and `openCloze` hands.
* **Binary-Disabled Power-Ups** (`BINARY_DISABLED_POWER_UPS` in `/constants.ts`):
  * `SCALPEL` (**✂️ 50/50 Scalpel**) is restricted strictly to `multipleChoice` and `openCloze` hands.
* **Multiplayer-Only Power-Ups** (`MP_ONLY_POWER_UPS` in `/constants.ts`):
  * `PEEKABOO` (**🕵️ Peekaboo**) is only drawable and usable when a Live Multiplayer room (`mpRoomCode`) is active.
* **Non-Offensive Targeted Power-Ups** (`NON_OFFENSIVE_TARGETED_POWER_UPS` in `/constants.ts`):
  * `PEEKABOO` and `COPYCAT` do not count toward the "1 offensive attack per target per round" multiplayer limit (`isPlayerTargetedThisRound`), and `COPYCAT` ignores `SHIELD` / `GUARDIAN_ANGEL`.

### Key Power-Up Invariants:
* **`SECOND_CHANCE` (👼 Second Chance)**: Auto-revives a player with **$300** the next time their bankroll hits `$0` at round settlement, then consumes the effect.
* **`BOOMERANG` (🪃 Boomerang)**:
  * Must remain **concealed** on rivals' target selection lists (`isTargetShielded` must NOT be true for `BOOMERANG`), allowing attackers to target the player and trigger the reflection.
  * Reflects offensive targeted power-ups (`THE_PUNISHER`, `PICKPOCKET`, `SUB_ZERO`, `BET_CAP`, `HIGH_ROLLER`, `HALF_BAKED`, `SWAP`, `CRUCIO`, `SILENCER`) back onto the attacker and consumes one `BOOMERANG`.
  * If a poorer player (`sourcePlayer.money < targetPlayer.money`) uses `SWAP` against a `BOOMERANG` holder, `BOOMERANG` steals **25% of the attacker's bankroll** instead of swapping vaults.
* **`HIGH_ROLLER` vs `BET_CAP`**:
  * Mutually exclusive on the same target: applying `HIGH_ROLLER` clears any active `BET_CAP` on that target, and applying `BET_CAP` clears any active `HIGH_ROLLER` on that target.
* **`DOUBLE_OR_NOTHING` (🎲 Double or Nothing)**:
  * Pays **3× (+200%)** on a win, or loses **1.5× the bet** on a miss.
  * In `binary` mode on a **flawed** sentence (`!currentSentence.isCorrect`), a valid correction (`verifications[player.id]?.isCorrect`) is **mandatory**—picking "Flawed" without a valid correction results in the `-1.5×` loss.
* **Two-Pass Round Settlement (`handleRevealResults` in `/App.tsx`)**:
  * **Pass 1** computes each participating player's individual answer, wager (`finalBet`), and personal multipliers (`SPLIT_BET`, `DOUBLE_OR_NOTHING`, `LONE_WOLF`, `CROWD_SURFER`, `BOUNTY_HUNTER`, `CORRECTION_BOUNTY`, `JACKPOT`, `SNOWBALL`, `CRUCIO`, `IMMUNITY_IDOL`, `SAFETY_NET`, `BLESSING`, `SAVINGS_ACCOUNT`, `TEACHERS_PET`).
  * **Pass 2** resolves relational power-ups (`COPYCAT` and `BLOOD_PACT`) using the `baseWinningAmounts` snapshot from Pass 1 so evaluation order never skews payouts.

---

## 5. Gemini API SDK & Model Rotation Conventions

* Always use the official **`@google/genai`** SDK (`import { GoogleGenAI, Type, Modality, ThinkingLevel } from '@google/genai'`). Never import `@google/generative-ai`.
* Both `/server.ts` and `/electron/geminiHandler.cjs` use automatic model rotation with per-model 429/404 cooldown tracking (`callWithModelRotation`):
  * **Text Models (`TEXT_MODELS`)**: `["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-flash-latest", "gemini-3.8-flash"]` (with `ThinkingLevel.LOW` applied when `gemini-3.8-flash` is selected).
  * **Audio / TTS Models (`TTS_MODELS`)**: `["gemini-3.8-flash-lite-tts", "gemini-3.8-flash-tts"]` using voice `"Kore"` (returns base64 raw 24kHz 16-bit mono PCM audio decoded via `pcmToAudioBuffer`), with automatic fallback to the browser's native Web Speech API (`window.speechSynthesis`) when in Offline Mode or if TTS quota is reached.


## 6. Projector Mode (readability theme)

* The 📽️ button in the top-right bar toggles the `projector` class on `<html>` (saved in `localStorage` as `grammar_casino_projector_mode`). It is hidden below the `sm` breakpoint because phones don't need it.
* The rules live at the end of the `<style>` block in `index.html`: small text (`text-[8px]` to `text-[11px]`, `text-xs`) gets a minimum size, faded small text loses its `opacity-*`, and every translucent text colour (`text-amber-200/60`, `dark:text-amber-100/80`, ...) is replaced with a solid one.
* The colour rules are an explicit list. **If you add a new translucent text class (`text-<colour>/<alpha>`), add a matching projector rule**, or that text will stay faded in projector mode. Light-theme rules use `html.projector:not(.dark)`, dark-theme rules use `html.projector.dark .dark\:...`, and elements with a `hover:text-*` class are only overridden while not hovered.

## 7. Firestore Rules & Who Can See Class Data

* `firestore.rules` is the source of truth, but **it only takes effect once it is pasted into the Firebase console** (project `cool-citadel-456408-k5`, database `ai-studio-grammarcasino-…` > Rules > Publish). Nothing deploys it automatically.
* **Rosters and session reports** (student names) are readable and writable only by the teacher's Google account (`teacher.siqueira@gmail.com`, verified email). The same address is `VERIFIED_TEACHER_EMAIL` in `/services/firebaseService.ts`; keep both in sync. The Teacher PIN does **not** open the Cloud Vault, because Firestore can't see the PIN. `CloudManagerModal` shows a Google sign-in panel instead. Google sign-in doesn't work in the Electron app (popups open in the system browser).
* **Cloud sentence bank**: public read; only the teacher adds or deletes. `archiveSentenceToCloudBank` skips silently for anyone else.
* **Live rooms**: every device gets a Firebase identity from `ensureFirebaseUser()` (Google if signed in, otherwise silent anonymous sign-in, which must be enabled in Firebase Authentication). Three kinds of documents:
  * `rooms/{code}`: the **shared table** (`tableJson`), readable by anyone with the code. `splitPlayerViews()` in `/utils/multiplayerProtocol.ts` puts a key there only if it is in `SHARED_VIEW_KEYS` **and** identical in every player's view. Never add a per-player key (bets, hints, power-ups, notifications) to `SHARED_VIEW_KEYS`. Carries `hostUid`; only the host (or the teacher) can update or close it.
  * `rooms/{code}/seats/{clientId}`: each phone's **private record** (its part of the view, its join answer, `kicked`), addressed to the phone's Firebase id (`uid`). Only the host writes it; only that `uid` and the host can read it. The host writes the table and all changed seats in one batch with a `rev`; `seatRevs` in the table tells the phone which seat `rev` matches, so it never shows a new round with an old bet.
  * `rooms/{code}/intents/{clientId}`: what each phone sends. Each phone writes only its own (rules force `uid`), only the host reads them. The document holds the phone's last 20 intents with a `seq`, because quick writes to one document can skip snapshots; the host applies only `seq` above the last it handled.
* **No public relays.** Rooms used to be mirrored over free public MQTT brokers, where anyone with the code could read every bet. That relay was removed; rooms run over Firestore (any host) or the local server (`/ws`, which sends each phone only its own view). Don't add a broadcast channel that carries per-player views.
* **Seat by name**: a phone that joins with a name already seated gets the seat back straight away only if it is the same browser (same Firebase id). From another device the teacher's screen asks "A new phone wants to play as Ana" (`SEAT_TAKEOVER_REQUEST`, `answerSeatTakeover()`); the old phone is signed out if the teacher says yes. Without this, typing a classmate's name would show and control their bet.
* **Testing rule changes**: `scripts/check-firestore-rules.mjs` runs about 50 allow/deny checks against the Firestore emulator (instructions at the top of the file; needs Java). To click through the app against emulators instead of the real project, start Auth and Firestore emulators on ports 9099 and 8080 and run `VITE_FIREBASE_EMULATORS=1 npx tsx server.ts`.
