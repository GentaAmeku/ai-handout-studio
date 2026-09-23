# Contributing

Issues are welcome — bug reports, feature ideas, questions.

For a pull request, please open an issue first to discuss the change before
you write the code. This project is used by one person day to day, so it's
worth agreeing on direction before a larger patch.

## Before you open a pull request

Read [AGENTS.md](AGENTS.md) for the project's conventions, then run:

```
pnpm typecheck && pnpm test && pnpm test:skills && pnpm lint && pnpm build && pnpm test:export
```

`pnpm exec playwright install chromium` is needed once before `pnpm test:export`.
