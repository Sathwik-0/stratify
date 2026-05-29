# Branching and Commit Workflow

## Branches

- `main`: production-ready, deployable at all times.
- `dev`: integration branch for validated work before promotion to `main`.
- `feature/*`: isolated work branches for scoped changes.

## Commit Convention

Use conventional commits:

- `feat:` user-visible capability or production workflow addition
- `fix:` bug fix or reliability correction
- `chore:` tooling, CI, repo hygiene
- `refactor:` behavior-preserving code structure change
- `docs:` documentation-only change
- `perf:` performance improvement
- `test:` test or verification coverage

## Safe Development Loop

1. Create or switch to a feature branch.
2. Make a small, reversible change.
3. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Commit with a conventional message.
5. Push and open a PR into `dev`.
6. Promote `dev` to `main` only after CI is green.

## Rollback

Prefer `git revert <sha>` for production hotfix rollbacks. Avoid force-pushing `main`.
