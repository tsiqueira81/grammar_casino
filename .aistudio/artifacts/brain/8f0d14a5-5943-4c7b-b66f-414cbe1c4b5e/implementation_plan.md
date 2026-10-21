# Two-Step Table Configuration & `gemini-3.8-flash-lite` Upgrade Plan

Divide the **Table Configuration (`SETTINGS`)** screen into two focused steps so Round 1's sentence is automatically pre-fetched the moment the teacher advances from Step 1 (Grammar Topic, CEFR Level, Theme, and Challenge Format) to Step 2 (Power-Up Shoe, Victory Condition, and Turn Clock), while prioritizing **`gemini-3.8-flash-lite`** for ultra-fast sentence generation.

## User Review & Critical Decisions

> [!IMPORTANT]
> - **Confirmed Decision 1 — Two-Part Settings Flow**:
>   - **Part 1 (Linguistic Charter)**: I. Grammatical Domain, II. Stakes & Proficiency (CEFR), III. Salon Atmosphere & Theme, and IV. Challenge Format.
>   - **Part 2 (House Rules & Shoe)**: V. House Power-Up Shoe, VI. Table Rules & Victory Condition, and VII. Betting Turn Clock.
> - **Confirmed Decision 2 — Round 1 Pre-Fetch Trigger**: Advancing from Part 1 to Part 2 validates any custom topic/theme inputs, locks in the linguistic settings, and immediately triggers the background pre-fetch for Round 1 so clicking **Deal the First Hand ♠️** loads Round 1 in ~0ms.
> - **Confirmed Decision 3 — Model Prioritization (`gemini-3.8-flash-lite`)**: Prioritize `gemini-3.8-flash-lite` first in `TEXT_MODELS` (with automatic fallback to `gemini-3.8-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash-lite`, and `gemini-2.5-flash`).

## 1. Overview & Core Concept

- **What It Does**: Eliminates both wasted speculative API calls while browsing topics/themes and the initial Round 1 wait time when starting a game, while reducing raw generation time via `gemini-3.8-flash-lite`.
- **Target Audience / Persona**: Classroom teachers and players setting up a new game of Grammar Casino.
- **Key Value**: A cleaner, scroll-free 2-step table setup lobby where Round 1 is already generated in the background while the teacher configures power-ups, win conditions, and the turn timer.

## 2. User Experience & Visual Design

- **Key User Flows**:
  1. **Step 1 — Linguistic Charter (Part 1)**: After seating players in the Guest Registry, the teacher selects the **Grammatical Domain**, **CEFR Level**, **Salon Theme**, and **Challenge Format**. Clicking **Continue to Table Rules & Power-Ups →** validates that any custom topic/theme is filled in and transitions to Part 2.
  2. **Step 2 — House Rules & Power-Ups (Part 2)**: While the teacher reviews or customizes the **Power-Up Shoe**, **Victory Condition**, and **Betting Turn Clock**, the app silently pre-fetches Round 1's sentence in the background. A compact summary pill bar at the top displays the locked-in Topic, Level, Theme, and Format with a **← Back to Challenge Setup** button in case they change their mind.
  3. **Instant Round 1 Deal**: Clicking **DEAL THE FIRST HAND ♠️** consumes the pre-fetched sentence (or awaits the in-flight request if clicked immediately), opening the game table without delay.
- **Visual Identity & Theme**:
  - Preserves the ornate Monte Carlo *Salon Privé* gold-and-emerald aesthetic (`glass-panel`, `felt-well`, brass step badges).
  - Adds a 2-step progress indicator header (`Step 1 of 2 · Challenge Setup` ↔ `Step 2 of 2 · House Rules & Shoe`) at the top of the Table Configuration panel.

## 3. Key Product Decisions & Trade-Offs

- **Decision 1: Pre-fetch on Step 2 Entry + Consume on Deal First Hand**
  - *Chosen Approach*: Trigger the background pre-fetch inside the `useEffect` whenever `(step === 'SETTINGS' && settingsPart === 2) || step === 'RESULTS'`, and update `handleFinalizeSettings` so `fetchNewSentence` consumes `prefetchRef.current` instead of bypassing it with a separate `forcedBatch`.
  - *Why*: Previously, `handleFinalizeSettings` passed a fresh `forcedBatch` argument to `fetchNewSentence`, which bypassed `prefetchRef.current`. Generating the initial 50/50 binary batch inside the pre-fetch effect ensures Round 1 uses the pre-fetched sentence seamlessly while maintaining balanced Correct/Incorrect hands.
- **Decision 2: Prioritize `gemini-3.8-flash-lite` with `ThinkingLevel.LOW`**
  - *Chosen Approach*: Place `gemini-3.8-flash-lite` at index `0` of `TEXT_MODELS` with `gemini-3.8-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash-lite`, and `gemini-2.5-flash` as automatic fallback models.
  - *Why*: Combines the lowest Time-To-First-Token model tier with minimal thinking overhead and automatic model rotation resiliency.

## 4. Technical Architecture & Data Strategy *(Technical Reference)*

```
┌──────────────────────────────────────────────────────────────────────────┐
│                     TABLE CONFIGURATION (SETTINGS)                       │
│                                                                          │
│  ┌────────────────────────────────┐    ┌──────────────────────────────┐  │
│  │ Part 1: Linguistic Charter     │    │ Part 2: House Rules & Shoe   │  │
│  │ • I. Grammatical Domain        │───▶│ • V. House Power-Up Shoe     │  │
│  │ • II. CEFR Proficiency         │    │ • VI. Victory Condition      │  │
│  │ • III. Salon Theme             │◀───│ • VII. Betting Turn Clock    │  │
│  │ • IV. Challenge Format         │    └──────────────┬───────────────┘  │
│  └────────────────────────────────┘                   │                  │
│                                                       ▼                  │
│                                       ┌──────────────────────────────┐   │
│                                       │ Background Pre-Fetch Effect  │   │
│                                       │ • Resolves finalTopic/Theme  │   │
│                                       │ • Calls generateSentence()   │   │
│                                       │   via gemini-3.8-flash-lite  │   │
│                                       │ • Stores in prefetchRef      │   │
│                                       └──────────────┬───────────────┘   │
└──────────────────────────────────────────────────────┼───────────────────┘
                                                       │
                                                       ▼
                                       ┌──────────────────────────────┐
                                       │ handleFinalizeSettings()     │
                                       │ • Consumes prefetchRef (0ms) │
                                       │ • Enters IN_GAME Round 1     │
                                       └──────────────────────────────┘
```

- **State Additions**:
  - `settingsPart`: `1 | 2` (defaults to `1` when entering `SETTINGS` from `PLAYER_SETUP` or restarting the game).
  - `handleAdvanceToSettingsPart2`: Validates `customTopic` / `customTheme`, commits resolved `topic` / `theme` or passes them cleanly to the pre-fetch key, and sets `settingsPart(2)`.
  - Unified pre-fetch `useEffect`: Runs both when `step === 'SETTINGS' && settingsPart === 2` (for Round 1) and when `step === 'RESULTS'` (for Round 2+).
