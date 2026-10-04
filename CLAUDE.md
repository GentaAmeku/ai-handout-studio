@AGENTS.md

## Claude cloud sessions

In a Claude cloud session (`CLAUDE_CODE_REMOTE=true`), the user can't see the screen. Finish every change by opening a pull request as described under "Pull requests" in AGENTS.md, with before/after screenshots when the screen changes. The user asked for this in advance, so open the PR without asking again.

In a Claude cloud session, the SessionStart hook (`scripts/cloud-session.sh`) puts Node 24 from `/opt/node24` on `PATH`, installs dependencies and Chromium; it does nothing locally. The cloud environment's setup script must install Node 24.15.0 to `/opt/node24` and pnpm 11.9.0, and its network access must also allow `cdn.playwright.dev` and `playwright.download.prss.microsoft.com`.

## GitHub Actions

When you run from `.github/workflows/claude.yml` (`GITHUB_ACTIONS=true`) and were asked to change code, the same holds: run the checks, and open the pull request yourself with `gh pr create --base main` as described under "Pull requests" in AGENTS.md, instead of posting a "Create a PR" link. Put `Fixes #<issue>` in the body's 補足 section. If you were started from a comment on an existing pull request, push to its branch and don't open another one.
