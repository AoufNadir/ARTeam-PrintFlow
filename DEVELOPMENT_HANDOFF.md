# ARTeam PrintFlow - Development Handoff

Last reviewed: 2026-09-06

## Local Project

- Git root: `C:\Users\User\Documents\kimi\workspace\Kimi-ARTeam-PrintFlow`
- App root: `C:\Users\User\Documents\kimi\workspace\Kimi-ARTeam-PrintFlow\app`
- Current working branch created for continuation: `codex/project-unification-2026-09-06`
- Main app stack: React 19, TypeScript, Vite, Tailwind, Radix UI, Playwright, Vitest.
- Main domain modules:
  - `app/src/pages/Builder.tsx`: service/section/pricing builder.
  - `app/src/pages/DevisCreate.tsx`: quote creation and edit workflow.
  - `app/src/pages/Montage.tsx`: montage studio.
  - `app/src/lib/storage.ts`: localStorage repository and data migrations.
  - `app/src/lib/types.ts`: shared domain contracts.
  - `app/src/lib/pricing-engine.ts`: pricing calculations.
  - `app/src/lib/montage-engine.ts`: layout and sheet calculation engine.

## GitHub

- Local remote: `https://github.com/AoufNadir/ARTeam-PrintFlow.git`
- GitHub repo: `AoufNadir/ARTeam-PrintFlow`
- Default branch on GitHub: `main`
- Local continuation branch before this handoff: `ARTeam-PrintFlow-Test1`
- `ARTeam-PrintFlow-Test1` is ahead of `main` by 7 commits.
- No GitHub pull requests, issues, or Actions runs were found for `AoufNadir/ARTeam-PrintFlow`.

## Supabase

- Local env points to project ref: `mxxggluwbotbypzyobwm`
- Supabase project name: `arteam-printflow`
- Supabase status at review time: `ACTIVE_HEALTHY`
- Current public table: `public.printflow_records`
- RLS is enabled.
- Row count at review time: `0`
- Local schema file: `app/supabase/schema.sql`
- Supabase migration history is currently empty, so future schema work should introduce formal migration files.

## Vercel

Vercel is the only non-unified part.

- Local `.vercel/project.json` points to:
  - project name: `arteam-printflow`
  - project id: `prj_zZ0cXzFqn3Krthc3cUpV2NNvUYI7`
  - org id: `team_a7ewtFCpSUbzxYehGMAk2xaR`
- The connected Vercel MCP account lists a different project:
  - project name: `my-app`
  - project id: `prj_PUUTgyzjoEDGSbc2AcOGumgk4j1K`
  - linked GitHub repo: `AoufNadir/My-App`
- The local Vercel CLI listed another scope/project: `aaoufnadir-5274/dawenli`.

Before production deployment, re-link Vercel intentionally to the correct `AoufNadir/ARTeam-PrintFlow` project or create a fresh Vercel project for this repo.

## Verification

Commands run from `app` on 2026-09-06:

```powershell
npm run lint
npm test
npm run build
npm run test:e2e
```

Results:

- ESLint passed.
- Vitest passed: 6 test files, 35 tests.
- Production build passed.
- Playwright passed: 6 tests.

Known build warning:

- Large client chunks after minification, especially the main app/PDF/montage path. Consider route-level lazy loading or manual chunks later.

## Recommended Next Steps

1. Commit the current app changes and this handoff file on `codex/project-unification-2026-09-06`.
2. Push the branch to GitHub and use it as the clean continuation branch.
3. Decide whether `ARTeam-PrintFlow-Test1` should replace `main`, or open a pull request into `main`.
4. Re-link Vercel to `AoufNadir/ARTeam-PrintFlow` before deploying.
5. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the final Vercel project.
6. Convert `app/supabase/schema.sql` into a formal Supabase migration before future database changes.
