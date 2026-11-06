# Grammar Casino — Antigravity Local Blender & Godot 4 Toolkit

This directory contains ready-to-run scripts for **Antigravity** on your local PC so it can invoke your local **Blender** and **Godot 4** installations directly.

---

## What Is Already Implemented in the Web App
1. **Broadcast Game-Show Cut-In Banners (`components/BroadcastCutIn.tsx`)**
   - Full-screen diagonal broadcast cut-in banner (`motion/react`) whenever a player launches a targeted power-up, triggers a **Boomerang** reflection, or activates a table-wide power-up.
   - Automatically disabled when **Calm Mode** is active.
2. **Theme-Reactive Classroom Ambience (`components/ThemeAmbience.tsx`)**
   - Dynamic ambient stage lighting behind the casino felt that shifts to match the round's chosen Theme (*Pop Culture* premiere spotlights, *Science & Sci-Fi* cyan/indigo horizon glow, *Fantasy & Mythology* arcane gold embers, *Technology & Internet* cyber grid glow, etc.).
3. **Reactive Avatar State Overlays (`components/PlayerTileGrid.tsx`)**
   - **Shield / Guardian Angel**: Pulsing cyan protective dome ring around the seat avatar + badge.
   - **Sub-Zero (`FREEZE`)**: Frosted ice crystal ring & aura around frozen seats.
   - **3+ Win Streak**: Golden flame aura + `🔥 N×` ribbon on the player's avatar.
4. **Peg-Collision Flapper Physics on the Wheel of Fortune (`components/WheelModal.tsx`)**
   - Real-time `requestAnimationFrame` angular tracking across all 20 brass studs: every 18° peg physically kicks the top crimson pointer flapper and triggers a synchronized audio click (`playSound('click')`) at the exact frame of peg impact.
5. **Cambridge Part 4 Two-Mark Split Reveal (`App.tsx`)**
   - On the `RESULTS` screen for Key Word Transformation rounds, displays the side-by-side **1st Half · 1 Mark (`+1 pt`)** and **2nd Half · 1 Mark (`+1 pt`)** breakdown right beneath the full correction.

---

## Step 1: Generate the 3D `.glb` Casino Props with Headless Blender in Antigravity

When you open this repository in **Antigravity**, ask the agent (or run in terminal):

```bash
blender --background --python antigravity-toolkit/blender_generate_props.py
```

This headless Blender Python script procedurally models, bevels, assigns PBR materials (Mahogany, Brushed Brass, Clay, Emissive Shield/Ice), and exports four `.glb` asset packs into `public/models/`:
- `public/models/poker_chips.glb` (`$10`, `$25`, `$50`, `$100`, `$500` clay chips with recessed brass rings)
- `public/models/card_shoe.glb` (Mahogany & brushed brass croupier shoe + emerging gold-foil power-up card)
- `public/models/wheel_of_fortune.glb` (20-wedge casino wheel, 20 physical brass pegs, and separate top flapper mesh)
- `public/models/powerup_totems.glb` (Shield Dome, Sub-Zero Ice Block, Boomerang, and Win-Streak Crown totems)

---

## Step 2: Wire the Godot 4 3D Tabletop Scene (`godot_tabletop_controller.gd`)

`antigravity-toolkit/godot_tabletop_controller.gd` is a complete **Godot 4 `Node3D` controller** (`CasinoTabletopController`) that connects to the React app via `JavaScriptBridge` (`window.grammarCasinoGodot`):
- `toss_bet`: Spawns `RigidBody3D` chips from a player's seat and launches them into the central pot with torque and bounce.
- `sweep_pot`: Tweens and rakes the central pot chips to all winning seats (or toward the House bank on a sweep).
- `spin_wheel`: Spins the 3D Wheel of Fortune with quartic ease-out and emits `wheel_settled`.
- `boomerang_reflect`: Launches a 3D curved Boomerang trajectory from the attacker's seat to the defender's seat and right back.

### Prompt to Give Antigravity on Your PC
> *"Run `antigravity-toolkit/blender_generate_props.py` using my local Blender installation to generate `public/models/*.glb`, then either mount them in a Three.js / React Three Fiber canvas or export a Godot 4 Web build using `antigravity-toolkit/godot_tabletop_controller.gd`."*
