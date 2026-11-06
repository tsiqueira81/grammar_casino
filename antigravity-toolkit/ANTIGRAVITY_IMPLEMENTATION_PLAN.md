# Grammar Casino — Full Antigravity Implementation Plan (Blender + Godot 4 / Three.js)

This implementation plan is designed to be executed directly by **Antigravity** on your local machine where **Blender** and **Godot 4** (or Node.js + Three.js) are installed.

---

## Context & Current Architecture
- **Already Implemented in React (`App.tsx` + `components/`)**:
  - `components/BroadcastCutIn.tsx`: Broadcast diagonal "Vs." cut-in banners (`motion/react`) for targeted power-ups, Boomerang reflections, and table-wide power-ups.
  - `components/ThemeAmbience.tsx`: Theme-reactive classroom lighting backdrop behind the felt.
  - `components/PlayerTileGrid.tsx`: Reactive 2D/CSS avatar rings for Shield, Sub-Zero (`FREEZE`), and 3+ Win Streaks (`🔥 N×`).
  - `components/WheelModal.tsx`: 20-peg `requestAnimationFrame` angular-velocity flapper physics with synchronized audio ticks.
  - `App.tsx`: Cambridge Part 4 two-mark split breakdown (`1st Half · 1 Mark` + `2nd Half · 1 Mark`) on the `RESULTS` screen.
- **Prepared Scripts in `/antigravity-toolkit/`**:
  - `antigravity-toolkit/blender_generate_props.py`: Headless Blender Python generator for all 4 `.glb` 3D prop packs.
  - `antigravity-toolkit/godot_tabletop_controller.gd`: Godot 4 `Node3D` physics controller (`CasinoTabletopController`) with `JavaScriptBridge` support.

---

## Phase 1: Headless Blender 3D Asset Generation (`public/models/*.glb`)

### Goal
Use your local Blender installation in headless mode to procedurally model, bevel, shade (PBR Metallic/Roughness/Transmission), and export all 3D casino props into `public/models/`.

### Steps for Antigravity
1. **Verify Blender CLI path**:
   - Check `blender --version` (on Windows, typically `C:\Program Files\Blender Foundation\Blender 4.x\blender.exe`; on macOS, `/Applications/Blender.app/Contents/MacOS/Blender`; on Linux, `blender`).
2. **Run the procedural generator**:
   ```bash
   blender --background --python antigravity-toolkit/blender_generate_props.py
   ```
3. **Enhance `blender_generate_props.py` with high-detail textures & animations**:
   - **Poker Chips (`public/models/poker_chips.glb`)**:
     - Bake procedural normal/roughness edge-spots around the circumference of each denomination (`$10` Blue, `$25` Green, `$50` Red, `$100` Obsidian/Gold, `$500` Royal Purple) and stamped denomination decals on the center recess.
   - **Dealer Card Shoe (`public/models/card_shoe.glb`)**:
     - Add an armature/keyframed action (`CardDrawSlide`) where the top gold-foil card slides out of the mahogany shoe slot, flips `180°` toward the camera, and hovers.
   - **Wheel of Fortune (`public/models/wheel_of_fortune.glb`)**:
     - UV-project the 20 wedge colors (`WHEEL_ITEMS` in `constants.ts`) onto `WheelDisc`, keeping `WheelFlapper` as a separate top-hinged mesh at `(0, 1.92, 0.16)` so it can pivot independently on the Z-axis.
   - **Power-Up Table Totems (`public/models/powerup_totems.glb`)**:
     - Export individual named meshes:
       - `Totem_ShieldDome` (icosphere with Fresnel emissive blue shader)
       - `Totem_SubZeroIce` (beveled refractive ice cube for frozen seats)
       - `Totem_Boomerang` (curved amber/gold boomerang mesh)
       - `Totem_StreakCrown` (metallic gold crown for 3+ win streaks)
4. **Verify output**:
   - Confirm `public/models/poker_chips.glb`, `public/models/card_shoe.glb`, `public/models/wheel_of_fortune.glb`, and `public/models/powerup_totems.glb` exist and are each `< 2 MB`.

---

## Phase 2: Choose & Wire the 3D Runtime (Track A: React Three Fiber vs. Track B: Godot 4 Web Canvas)

> **Recommendation for Antigravity**:
> - **Track A (React Three Fiber + Rapier 3D Physics)** is the fastest, zero-iframe integration inside the existing Vite + React + Electron app: it loads `public/models/*.glb` directly inside a transparent `<Canvas>` overlay over the felt table.
> - **Track B (Godot 4 HTML5 Web Export)** uses your local Godot 4 engine and `antigravity-toolkit/godot_tabletop_controller.gd` compiled to WebAssembly (`public/godot/tabletop.wasm` + `.pck`) and controlled via `window.grammarCasinoGodot(...)`.

### Track A — Native Three.js / React Three Fiber + Rapier Physics (Recommended for Fast Integration)
1. **Install packages**:
   ```bash
   npm install three @types/three @react-three/fiber @react-three/drei @react-three/rapier
   ```
2. **Create `components/Tabletop3DOverlay.tsx`**:
   - Mount an interactive, pointer-events-passthrough `<Canvas shadows camera={{ position: [0, 5.5, 6.2], fov: 38 }}>` above the casino table during `step === 'IN_GAME'` and `step === 'RESULTS'`.
   - Disable or pause `<Canvas frameloop="demand">` automatically when `isCalmMode === true`.
   - Load `useGLTF('/models/poker_chips.glb')`, `useGLTF('/models/card_shoe.glb')`, and `useGLTF('/models/powerup_totems.glb')`.
3. **Implement 3D Physics Events**:
   - **Chip Toss on Bet Placement**: When a player adds chips (`$10`, `$25`, `$50`, `$100`, `$500`) or locks a bet in `App.tsx`, spawn a `<RigidBody colliders="hull" restitution={0.35} friction={0.6}>` chip clone from that seat's screen-projected 3D coordinates and apply an impulse toward the center pot `(0, 0.2, 0)`.
   - **Pot Sweep on `RESULTS`**: When `handleRevealResults()` settles the round in `App.tsx`, animate all pot chips sliding toward the winning players' seat coordinates (or toward the top dealer bank if the House wins).
   - **3D Seat Totems**: Render `Totem_ShieldDome`, `Totem_SubZeroIce`, and `Totem_StreakCrown` floating directly above each affected seat in 3D space.
   - **3D Boomerang Flight**: When `targetHasBoomerang` triggers in `handleTargetedPowerUp`, launch `Totem_Boomerang` along a `QuadraticBezierCurve3` from the attacker's seat to the defender's shield and back to the attacker's seat before applying the reflected effect.

### Track B — Godot 4 Engine Scene & HTML5 WebAssembly Export
1. **Create Godot 4 project at `godot-tabletop/project.godot`**:
   - Copy `antigravity-toolkit/godot_tabletop_controller.gd` into `godot-tabletop/scripts/godot_tabletop_controller.gd`.
   - Import the 4 `.glb` files from `../public/models/` into `godot-tabletop/models/`.
2. **Build `MainTabletop.tscn` headless or via GDScript scene builder**:
   - Root `Node3D` (`CasinoTabletop`) with `godot_tabletop_controller.gd` attached.
   - `StaticBody3D` green baize table floor with `BoxShape3D` collider (`physics_material_override` with `bounce = 0.25`, `rough = true`).
   - `RigidBody3D` `ChipScene.tscn` wrapping `poker_chips.glb` with a `CylinderShape3D` collider.
   - `DirectionalLight3D` (warm overhead casino lamp) + `WorldEnvironment` (subtle glow/SSR).
3. **Export Godot 4 Web build**:
   ```bash
   godot --headless --path godot-tabletop --export-release "Web" ../public/godot/index.html
   ```
4. **Create `components/GodotBridgeCanvas.tsx`**:
   - Embed the transparent Godot canvas and expose a helper `sendGodotEvent(payload)` that calls `window.grammarCasinoGodot(JSON.stringify(payload))`.
   - Hook `toss_bet`, `sweep_pot`, `spin_wheel`, and `boomerang_reflect` into `App.tsx`.

---

## Phase 3: Spatial Audio & Multi-Pitch Chip Clink Synthesizer

### Goal
Match every 3D collision (chip-on-felt, chip-on-chip, wheel peg deflection, Boomerang whoosh) with realistic procedural or sampled audio.

### Steps for Antigravity
1. **Upgrade `initializeSounds()` in `App.tsx` (or extract to `services/soundEngine.ts`)**:
   - Add a `chipClink(denomination)` sound that randomizes pitch (`±45 cents`) and filter resonance based on chip mass (`$10` higher clink, `$500` deeper clay thud) so rapid chip stacks never sound robotic.
   - Add a `boomerangWhoosh()` doppler filter sweep when a Boomerang reflects an attack.
   - Add a `potSweepRake()` soft brush + cascading chip chime when the pot slides to the round winners.

---

## Phase 4: Verification & Classroom Performance Guardrails

### Steps for Antigravity
1. **Unit & Integration Tests**:
   ```bash
   npx vitest run
   ```
   Ensure all 174 tests in `tests/` continue to pass.
2. **Typecheck & Production Build**:
   ```bash
   npm run lint
   npm run build
   ```
3. **Classroom Hardware & Calm Mode Check**:
   - Verify that toggling **Calm Mode** (`Wind` icon in top bar) immediately pauses/hides 3D particle/physics loops and broadcast cut-ins for zero GPU drain on older school laptops.
   - Verify that **Projector Mode** (`Projector` icon in top bar) keeps the 3D overlay behind the enlarged sentence banner and high-contrast player cards so text legibility from the back of the classroom is never obstructed.
