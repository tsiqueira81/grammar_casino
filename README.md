# Grammar Casino

A classroom game for EFL students. The teacher projects a table; students bet play money on grammar questions (valid or flawed, multiple-choice cloze, open cloze, word formation, key word transformation), either on the shared screen or from their own phones in a live room.

Live site: https://grammarcasino.pages.dev/

## Run it locally

Node 22 and npm are needed.

```bash
npm ci
npm run dev        # http://localhost:3000
```

Without AI keys the game uses its built-in offline sentence bank.

## Check a change

```bash
npm run lint       # TypeScript
npm test           # unit tests
npm run build      # production bundle in dist/
```

## Deploy

Open a pull request. GitHub Actions runs the checks and publishes a preview on Cloudflare Pages; the address is in the run's summary. Merging into `main` deploys to the live site, but only after lint, tests and build pass. Never push to `main` directly: students play on it.

## Contributing

Read [AGENTS.md](AGENTS.md) first. It has the architecture, the rules every change follows, and the game's invariants.
