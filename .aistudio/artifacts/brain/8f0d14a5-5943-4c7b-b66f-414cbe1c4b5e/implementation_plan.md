# Grammar Casino — Live Classroom Multiplayer Mode

Transform Grammar Casino from a single-screen pass-around board into a Kahoot/Jackbox-style live multiplayer classroom game where the teacher's projector acts as the authoritative Casino Table & Host and students join from their own phones or laptops via a 4-letter Room Code or QR scan.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Synthesized Multiplayer Architecture & Classroom Safeguards**
> Following the Multiplayer Feasibility Plan and classroom stress-test considerations, this implementation incorporates the following core decisions while keeping classic single-screen projector mode 100% intact:

- **Host-Authoritative + Dual-Transport Relay (WebSocket + HTTP Polling Fallback)**: The teacher's browser holds the authoritative game state and triggers all Gemini AI calls through the server. Student devices act as thin controllers ("intents in, filtered views out"). WebSockets on the shared port 3000 handle primary low-latency sync, while automatic HTTP polling fallback ensures students on strict school networks or cellular connections never drop out.
- **Zero Answer Leakage (`toPlayerView` & `toPublicView`)**: Answer fields (`isCorrect`, `correction`, `correctAnswer`, `acceptedAnswers`, `explanation`, `errorPhrase`, and unpurchased hints/goggles) are stripped before any state leaves the Host during `IN_GAME`, and are only broadcast once the round transitions to `RESULTS`.
- **Automatic House Bailout ($150 Emergency Chip Grant)**: In Multiplayer mode, if a student's balance drops to `$0` at the end of a round, the House automatically grants an emergency `$150` bailout at the start of the next round (or allows the teacher to trigger a table-wide bailout) so no student sits idle on their phone for the rest of the class.
- **Anti-Dogpiling Target Shield (Max 1 Incoming Attack per Round)**: Once a student has been targeted by an offensive power-up (`SUB_ZERO`, `CRUCIO`, `BET_CAP`, `SILENCER`, `SWAP`) in a given round, they gain temporary target immunity for the remainder of that round's betting window so the class cannot stack multiple attacks on the leader.
- **Deduplicated Batch AI Correction Verification**: When revealing results in Binary mode, identical normalized student corrections are deduplicated before calling Gemini so 20 students submitting variations of the same 3 answers require only 3 parallel AI checks instead of 20.

---

## 1. Overview & Core Concept

- **What It Does**: Adds a seamless **Live Multiplayer Room Mode** alongside the existing Single-Screen Mode. The teacher opens a Multiplayer Lobby with a 4-letter Room Code and scannable QR code; students join from their phones or laptops (`?room=CODE` or via the Join Room modal), pick their avatar and name, and place simultaneous hidden bets, answers, and power-ups on their own screens while watching the shared projector table.
- **Target Audience / Persona**: ESL/EFL teachers running a projector or interactive whiteboard in classrooms of 2–30 students using mobile phones, tablets, or Chromebooks.
- **Key Value**: Eliminates the bottleneck of students walking up to the teacher's computer one by one, turning every round into a simultaneous 60-second high-energy classroom showdown with complete wager privacy.

---

## 2. User Experience & Visual Design

### Key User Flows

1. **Teacher Host Lobby & Mode Switch**:
   - On the `PLAYER_SETUP` screen, the teacher can toggle between **Single-Screen Table** (classic mode) and **Live Multiplayer Room** (or click **"Open Multiplayer Room"**).
   - Opening a room generates a 4-character unambiguous room code (e.g., `K7XM`), displays a scannable QR code and direct join link (`?room=K7XM`), and shows live student seats filling up in real time as students connect.
   - The teacher can kick inappropriate nicknames, toggle a **Room Lock** once everyone is seated, and still add local/offline seats if a student doesn't have a device.
2. **Student Mobile Join & Reconnection Flow**:
   - Scanning the QR code or visiting the room URL automatically launches the **Student Mobile Controller** view. Students can also click **"Join Room"** from the main header to enter a 4-letter code manually.
   - On join, the student enters their display name, taps an avatar, and receives a persistent `reconnectToken` stored in `localStorage`. Refreshing the browser or switching from Wi-Fi to cellular automatically reclaims their exact seat, chip stack, and active bet.
3. **Simultaneous Betting Window (`IN_GAME`)**:
   - **Projector (Host View)**: Displays the target sentence at the center of the mahogany-and-emerald casino felt table, a unified round countdown clock, and a live **Player Lock-In Grid** showing each student's avatar, chip balance, active status effects, and a face-down chip badge (`Thinking...` vs. `Locked In ✓`) without revealing their chosen answer or wager amount.
   - **Student Mobile Controller**: Displays the student's live chip stack and streak in a compact top bar, the sentence card (with highlighted target phrase ONLY if that specific student purchased *Grammar Goggles*, or their private AI Hint if they purchased a Hint), interactive answer controls (True/False + correction input, 4-option Multiple Choice, or Open Cloze text input), quick-bet chip buttons (`$50`, `25%`, `50%`, `MAX`), a bottom sheet for the **Power-Up Shop** and **Wheel of Fate**, and a sticky bottom **"Lock In Bet"** CTA button.
4. **Synchronized Reveal & Payout (`RESULTS` & `GAME_OVER`)**:
   - As soon as all active students lock in (or when the round timer expires / teacher clicks **Reveal Results**), the Host verifies any unique student corrections, resolves all power-ups and payouts deterministically, and broadcasts the `RESULTS` state.
   - Student phones vibrate (`navigator.vibrate`) and display a personalized outcome banner (`+$250 WON!` or `-$100 LOST`, new balance, streak badge, and grammar explanation) while the projector reveals everyone's choices and the updated leaderboard.

### Visual Identity & Theme

- **Aesthetic Direction**: High-Roller Monte Carlo Felt & Mahogany for the Projector Host Table paired with a sleek, tactile Mobile Casino Controller optimized for one-handed thumb ergonomics ($375\text{px}$–$430\text{px}$ mobile viewport, expanding cleanly on student laptops).
- **Color Palette & 60-30-10 Discipline**:
  - **60% Dominant Surface**: Deep Casino Felt Green (`#0a2e1f` / `#061c13`) and dark slate-emerald backdrops.
  - **30% Structural Surfaces**: Warm dark mahogany panels (`#1a1412`), crisp ivory sentence cards, and subtle gold hairline borders (`border-amber-500/25`).
  - **10% Accent Budget**: Burnished Casino Gold (`#f59e0b`) for primary CTAs and chip totals, Emerald (`#10b981`) for locked/winning states, and Crimson (`#ef4444`) for penalties/timer warnings.
- **Typography & Hierarchy**:
  - *Display Face*: `Cinzel` for casino headers, room codes, and dramatic round titles (`text-wrap: balance`).
  - *Body & UI Controls*: `Montserrat` / `Plus Jakarta Sans` for crisp legibility across projectors and small mobile screens.
  - *Numeric & Chip Telemetry*: Tabular numerals (`tabular-nums`) for all chip balances, countdown timers, and wager inputs.
- **Ergonomics & Touch Targets**:
  - All student mobile buttons, chip selectors, and option cards enforce a minimum $48 \times 48\text{px}$ touch hitbox.
  - Sticky mobile header + bottom CTA bar stay strictly under the 15% mobile viewport height cap so the sentence and answer controls never feel cramped.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Host-Authoritative Relay over Full Server-Side Game Engine**
  - *Chosen Approach*: The teacher's browser remains the single source of truth for game state transitions, power-up resolution, and AI requests; the Node/Express server (`server.ts`) acts as a lightweight room relay (`ws` + HTTP fallback endpoints) and Gemini API proxy.
  - *Why*: Preserves 100% parity with existing single-screen gameplay, avoids duplicating 28 complex power-ups and audio cues on the backend, and works seamlessly in both cloud deployments and local classroom setups.
  - *Alternatives Considered*: Moving the entire state machine into `server.ts` (rejected because it duplicates state logic and complicates teacher-only host overrides like editing balances or undo).
- **Decision 2: Dual-Transport Networking (WebSocket + Automatic HTTP Polling Fallback)**
  - *Chosen Approach*: Primary communication uses a WebSocket server mounted directly on the Express HTTP server on port 3000 (`/ws`), paired with lightweight REST relay endpoints (`/api/mp/*`) that activate automatically if a school firewall blocks WebSocket upgrades.
  - *Why*: Guarantees near-zero latency when WebSockets are available while ensuring 100% reliability on restrictive school Wi-Fi or mobile carrier networks.
- **Decision 3: Simultaneous Betting with Deterministic Conflict Resolution**
  - *Chosen Approach*: All students bet concurrently under a shared round clock. Instant self-only power-ups (*Grammar Goggles*, *Hint*, *Safety Net*, *Split Bet*) apply immediately upon purchase; cross-player effects (*Robin Hood*, *Swap*, *Taxman*, *Lone Wolf*, *Bounty Hunter*) resolve in a deterministic canonical order at the start of `RESULTS`.
  - *Why*: Eliminates turn-by-turn waiting in large classes while preventing race conditions when two students trigger conflicting power-ups seconds apart.

---

## 4. Technical Architecture & Data Strategy

### Architecture & Component Diagram

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        EXPRESS + WS SERVER (Port 3000)                     │
│  ┌──────────────────────────────┐      ┌────────────────────────────────┐  │
│  │   Gemini AI Proxy (/api/*)   │      │  Multiplayer Room Relay (/ws   │  │
│  │  • gemini-3.8-flash-lite     │      │  & /api/mp/* HTTP Fallback)    │  │
│  │  • Sentence / Hint / Verify  │      │  • 4-Char Room Registry        │  │
│  └──────────────▲───────────────┘      │  • Seat & Reconnect Token Map  │  │
│                 │                      └───────▲────────────────▲───────┘  │
└─────────────────┼──────────────────────────────┼────────────────┼──────────┘
                  │                              │                │
       HTTPS POST │           Host State Sync &  │                │ Intents In /
                  │           Player Views Out   │                │ Filtered PlayerView
┌─────────────────┴──────────────────────────────┴───┐   ┌────────┴──────────────────────────┐
│        TEACHER HOST (Projector / Desktop)          │   │   STUDENT CONTROLLER (Mobile/Web) │
│  ┌──────────────────────────────────────────────┐  │   │  ┌─────────────────────────────┐  │
│  │ Authoritative Game State & Engine            │  │   │  │ Join / Reconnect Screen     │  │
│  │  • Single-Screen OR Multiplayer Room Host    │  │   │  │  • 4-Letter Code / QR Link  │  │
│  │  • Round Pre-fetcher (Round 1 & Round N+1)   │  │   │  │  • Name & Avatar Picker     │  │
│  │  • Deduplicated Batch Correction Verifier    │  │   │  └──────────────┬──────────────┘  │
│  │  • Deterministic Power-Up & Payout Resolver  │  │   │                 ▼                 │
│  │  • Automatic $150 House Bailout Engine       │  │   │  ┌─────────────────────────────┐  │
│  └──────────────────────┬───────────────────────┘  │   │  │ Live Betting & Answer Pad   │  │
│                         ▼                          │   │  │  • Filtered Sentence View   │  │
│  ┌──────────────────────────────────────────────┐  │   │  │  • Private Goggles & Hints  │  │
│  │ Security Filter (toPlayerView / toPublicView)│  │   │  │  • Wager Slider & Quick Bets│  │
│  │  • Strips answers, explanations & peer bets  │  │   │  │  • Power-Up Drawer & Wheel  │  │
│  │    during IN_GAME; unlocks on RESULTS        │  │   │  │  • Sticky "Lock In Bet" CTA │  │
│  └──────────────────────────────────────────────┘  │   │  └─────────────────────────────┘  │
└────────────────────────────────────────────────────┘   └───────────────────────────────────┘
```

### Data Model & State Filtering

- **Room Session State (`MultiplayerRoom`)**:
  - `code`: 4-character uppercase room code (excluding ambiguous `0/O/1/I`).
  - `locked`: Boolean preventing new joins once locked by the teacher.
  - `seats`: Map of `seatId -> { playerId, name, avatar, reconnectToken, connected, lockedIn, lastSeen }`.
- **Filtered `PlayerView` Payload (Sent to Each Student)**:
  - `roomCode`, `step`, `round`, `gameMode`, `roundEndsAt` (epoch timestamp for synchronized countdown), `settings` (topic, level, theme).
  - `me`: The student's own `Player` object, current `Bet` draft, `lockedIn` status, `privateHint` (if purchased), `hasGrammarGoggles` (if purchased), `activePowerUp`, and `roundResult` (on `RESULTS`).
  - `sentence`: Strictly filtered during `IN_GAME` to `{ text, questionType, options, grammarPhrase (only if me.hasGrammarGoggles) }`. Full `GeneratedSentence` is included only when `step === 'RESULTS'` or `'GAME_OVER'`.
  - `peers`: Public summary of all players `{ id, name, avatar, money, winStreak, effects, connected, lockedIn, hasActivePowerUp }` — never exposing peer bet amounts or chosen answers until `RESULTS`.

### Interactive Component & State Mapping

- **Host Multiplayer Lobby Modal & Bar**:
  - Triggered from `PLAYER_SETUP` or top bar via `"Multiplayer Room"`.
  - Renders scannable SVG QR code, copyable join link, room code badge, room lock toggle, and live connected seats list with kick and manual bailout controls.
- **Simultaneous Lock-In & Auto-Reveal**:
  - Students send `SET_BET`, `BUY_POWER_UP`, `BUY_HINT`, `SPIN_WHEEL`, and `LOCK_IN` intents to the Host via the relay.
  - On the Host `IN_GAME` table, each player card displays a live connection indicator and `Locked In` badge when their bet is finalized.
  - When all connected active players have locked in (or the round countdown reaches `0:00`), the Host can auto-trigger or one-click trigger `handleRevealResults` with deduplicated Gemini verification.
- **Student Mobile Controller (`StudentClientView`)**:
  - Automatically rendered when `?room=CODE` is present in the URL or when the user selects **"Join Room as Student"**.
  - Implements full interactive handlers for joining, editing bets, typing corrections/cloze answers, buying power-ups (with target picker modal respecting the 1-attack-per-round shield rule), spinning the Wheel of Fate, buying a private AI hint, and locking/unlocking bets before time expires.
