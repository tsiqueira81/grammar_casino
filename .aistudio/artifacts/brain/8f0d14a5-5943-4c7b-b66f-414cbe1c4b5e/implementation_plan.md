# Open Cloze Integrity, Plain English Default & Multiplayer Table Closed Screen

This plan addresses three enhancements to Grammar Casino: preventing incomplete or multi-word Open Cloze gaps (such as dropping prepositions in phrasal-prepositional verbs like *"look forward to"*), making Plain English the default explanation with an on-demand **Detailed Explanation** button, and displaying a dedicated **Table Closed** end-of-game screen on every player's device in Multiplayer mode with direct **Download PDF Report Card** support.

## User Review & Critical Decisions

> [!IMPORTANT]
> The following design choices were confirmed with you and govern this implementation:

- **Confirmed Decision 1 — Plain English Default + On-Demand Detailed Explanation**: Sentence generation will produce a clear, plain-English explanation by default (`explanation`), and clicking the **Detailed Explanation** button on the Results screen will request a more technical, linguistic rule breakdown on demand.
- **Confirmed Decision 2 — Compact Mobile "Table Closed" Screen with PDF Report Card Download**: When the host transitions to `GAME_OVER` (*Table Closed*), each connected student device will transition to a dedicated **Table Closed** screen displaying the crowned champion (or House victory), personal performance stats, final table standings, and a prominent **Download PDF Report Card** button.

---

## 1. Overview & Core Concept

- **What It Does**:
  1. **Strict Open Cloze Integrity**: Ensures that filling `correctAnswer` into `text` (`_____`) always produces a 100% grammatically complete sentence (`correction`) without missing prepositions or particles (e.g., *"I look _____ to visiting"* with `"forward"`, or *"I look forward _____ visiting"* with `"to"`, never *"I look _____ visiting"* with `"forward"`).
  2. **Plain English First**: Makes the default round explanation friendly, accessible, and jargon-light for students immediately upon reveal, while giving teachers and curious learners a **Detailed Explanation** button that generates a deeper grammatical analysis on demand.
  3. **Multiplayer Table Closed & PDF Export**: Synchronizes the end-of-game `roundHistory` and `winner` state to all connected player devices when `step === 'GAME_OVER'`, rendering a celebratory **Table Closed** view where every player can download the complete Grammar Report Card PDF directly to their phone, tablet, or laptop.
- **Target Audience / Persona**: ESL/EFL teachers hosting classroom sessions on a projector/smartboard and students participating either at the shared board or on their personal mobile devices.
- **Key Value**: Eliminates flawed AI cloze blanks, reduces cognitive friction during round reviews, and gives every student a portable takeaway study guide at the end of a multiplayer match.

---

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Open Cloze Generation & Self-Healing Validation**:
     - When generating an Open Cloze sentence, the prompt explicitly forbids replacing two words with a single blank (especially in 3-part phrasal-prepositional verbs like *look forward to*, *put up with*, *run out of*, *get along with*, or dependent prepositions) and requires `text.replace("_____", correctAnswer)` to equal `correction`.
     - Immediately after parsing the model response, a deterministic server-side validator checks whether substituting `correctAnswer` into `text` matches `correction`. If the model omitted an adjacent word (such as `"to"`) or returned a multi-word answer (`"forward to"`), the validator automatically reconstructs `text` directly from the valid `correction` sentence by blanking only the single target word so no word is ever lost.
  2. **Plain English Default & On-Demand Detailed Explanation**:
     - On the Round Results screen, the main explanation box displays the plain-English explanation by default.
     - Alongside the explanation, the action button now reads **Detailed Explanation**.
     - Clicking **Detailed Explanation** triggers an on-demand API request (`detailExplanation`) that displays an expanded linguistic/pedagogical breakdown below the plain-English summary (with a loading state `Analyzing...` and completed state `Detailed ✓`).
  3. **Multiplayer "Table Closed" on Player Devices**:
     - When the host clicks **Settle Accounts & Finish** (or **Cash Out Early**) to enter `GAME_OVER`, every connected student controller transitions from the Round Results view to the **Table Closed** view.
     - The student's screen displays:
       - **Salon Privé · Table Closed** header banner.
       - **Champion Showcase Card** (highlighting whether the student themselves won or showing the crowned table champion and their final bankroll, or *The House Prevails* if all players went bust).
       - **Personal Session Summary** (final rank, final vault balance, hands won, and accuracy percentage).
       - **Download Grammar Report Card (PDF)** primary CTA button that generates and downloads the full multi-round PDF report directly on the student's device.
       - **Final Standings Leaderboard** showing all players ranked by final bankroll.

- **Visual Identity & Theme**:
  - *Aesthetic Direction*: Monte Carlo Salon Privé luxury casino aesthetic (`felt-well`, `glass-panel`, `luxury-card`, brushed gold `#d4af37` accents, deep emerald felt `#071e12`).
  - *Typography & Hierarchy*: `Cinzel` display headers for `TABLE CLOSED`, `Cormorant Garamond` serif labels, `JetBrains Mono` (`tabular-nums`) for bankrolls and accuracy percentages, and clean sans-serif body text for explanations.
  - *Touch Ergonomics*: Minimum `48px` height on the student's **Download PDF Report Card** button with clear loading (`Generating PDF...`) and confirmation (`PDF Downloaded!`) states.

---

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Deterministic Server-Side Cloze Reconstruction + Prompt Hardening**
  - *Chosen Approach*: Combine explicit prompt rules against multi-word phrasal-verb truncation with a deterministic post-processing check that compares `text.replace(/_{2,}/, correctAnswer)` against `correction` and rebuilds `text` from `correction` whenever a mismatch or multi-word answer occurs.
  - *Why*: LLM prompts alone can occasionally slip on 3-word phrasal verbs (*look forward to*), whereas string-level verification between `correction` (the full grammatical sentence) and `text` guarantees that substituting the single-word `correctAnswer` into `text` always yields the exact `correction` sentence.
- **Decision 2: Plain English by Default with On-Demand Technical Breakdown**
  - *Chosen Approach*: Instruct the sentence generator (and curated fallback entries) to output clear, plain-English explanations by default, and repurpose the on-demand button/endpoint to generate a detailed grammatical explanation (`Detailed Explanation`) only when clicked.
  - *Why*: Students immediately understand *why* an answer is right or wrong without grammar jargon, and extra API calls are only spent when the teacher or student explicitly asks for deeper linguistic detail.
- **Decision 3: Syncing `roundHistory` to Student Views on `GAME_OVER`**
  - *Chosen Approach*: Include `roundHistory` in `PlayerViewPayload` only when `step === 'GAME_OVER'` so student devices can invoke `generateGrammarReportPDF` locally without bloating per-second timer broadcasts during active play.
  - *Why*: Keeps `IN_GAME` WebSocket messages lightweight while giving every student device full data to generate the rich PDF report card at the end of the game.

---

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

- **Architecture & Component Diagram**:
```
┌────────────────────────────────────────────────────────────────────────────┐
│                     SERVER / DESKTOP GEMINI HANDLER                        │
│  ┌────────────────────────────────────┐  ┌──────────────────────────────┐  │
│  │ generateSentence (Open Cloze)      │  │ detailExplanation (On-Demand)│  │
│  │ • Plain-English default explanation│  │ • Expands plain explanation  │  │
│  │ • Post-parse Cloze Integrity Check │  │   with grammatical terminology│  │
│  │   (text + correctAnswer === corr.) │  │   & structural rules         │  │
│  └─────────────────┬──────────────────┘  └──────────────┬───────────────┘  │
└────────────────────┼────────────────────────────────────┼──────────────────┘
                     │                                    │
                     ▼                                    ▼
┌────────────────────────────────────────────────────────────────────────────┐
│                        HOST TABLE (App.tsx)                                │
│  • Displays Plain English explanation by default on Results screen         │
│  • "Detailed Explanation" button fetches & displays technical breakdown    │
│  • Broadcasts winner + roundHistory in PlayerViewPayload on GAME_OVER      │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ WebSocket (PLAYER_VIEW)
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│               STUDENT DEVICE (StudentControllerView.tsx)                   │
│  • Renders dedicated "TABLE CLOSED" view when view.step === 'GAME_OVER'    │
│  • Shows Champion Card + Personal Accuracy/Rank + Final Leaderboard        │
│  • "Download PDF Report Card" button calls generateGrammarReportPDF()      │
└────────────────────────────────────────────────────────────────────────────┘
```

- **Data Model & State**:
  - `PlayerViewPayload` (in `multiplayerProtocol.ts`): Add optional `roundHistory?: RoundHistoryRecord[]` populated when `step === 'GAME_OVER'`.
  - `enforceOpenClozeIntegrity(data)` helper (in `server.ts` and `electron/geminiHandler.cjs`):
    - Checks if `correctAnswer` had multiple words before splitting (e.g., `"forward to"`). If `correction` is valid, locates the multi-word phrase in `text` / `correction`, keeps the first grammatical word (`"forward"`) as `correctAnswer`, and restores the remaining word(s) (`"to"`) into `text` right after `_____`.
    - Verifies that `text.replace(/_{2,}/, correctAnswer)` matches `correction` (case-insensitive, normalized whitespace). If any word is missing from `text`, reconstructs `text` by replacing the single occurrence of `correctAnswer` inside `correction` (within `grammarPhrase` if present) with `_____`.
- **Interactive Component & State Mapping**:
  - **Host Results Screen (`App.tsx`)**:
    - Default explanation box shows `currentSentence.explanation` (now written in plain, accessible English).
    - Button label updated to `Detailed Explanation` (loading: `Loading Details...`, done: `Detailed ✓`), calling `handleDetailExplanation` and rendering the **Detailed Grammar Breakdown** callout box.
  - **Student Controller (`StudentControllerView.tsx`)**:
    - Separates `view.step === 'GAME_OVER'` into its own dedicated **Table Closed** screen (while keeping `view.step === 'RESULTS'` for mid-game round settlements).
    - Includes a **Download PDF Report Card** button wired to `generateGrammarReportPDF` using `view.roundHistory`, `view.peers`, `view.winner`, and `view.settings`.
