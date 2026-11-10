---
name: grammar-casino-architecture
description: Pointer to AGENTS.md, the single guide for Grammar Casino's architecture, invariants and rules. Read it before modifying game logic, power-ups, AI prompts, or multiplayer code.
---

# Grammar Casino

Everything that used to live here is now in `AGENTS.md` at the repository root:

- the commands (`npm run dev`, `npm test`, `npm run lint`, `npm run build`), with npm as the only package manager
- how production really runs (Cloudflare Pages, a Pages Function for `/api/*`, Firestore rooms, and the host tab as the game authority)
- the folder map
- the rules for every change (never push to `main`, green before and after, phones first on weight, Calm mode)
- the invariants: no answer leakage, the host trusts nothing a phone claims, shared vs private room views, the House Bailout rules, and power-up compatibility sets
- the browser storage keys

Read `AGENTS.md` before changing code. Keep it, not this file, up to date.
