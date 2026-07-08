# Chakri Labs

A living archive of projects, experiments, simulations, tools, and side quests —
a catalog that builds itself from GitHub so I never have to hand-maintain a project
list again.

## How it works

1. `scripts/sync-github.ts` pulls every public repo for `GITHUB_USER`
   (default `chakri68`), finds each repo's README (via `raw.githubusercontent.com`
   — no API rate limit) and any GitHub Pages metadata.
2. It merges hand-authored curation from `data/project-overrides.json`, works out
   each project's live link, sorts, and writes one committed file,
   `public/data/projects.json` (the merged, sorted list). README markdown is **not**
   committed — each project keeps a `readmeUrl` that the detail page fetches live in
   the browser.
3. The app reads that data at runtime. Repos **with a README** get a detail page
   (`#/p/<slug>`) and sort first; repos without one are cards that just link to GitHub.

### Showing / hiding a project

Every project in `projects.json` has a `show` boolean. Flip it to `false` to hide
a project (or `true` to surface a fork or archived repo). **Sync won't clobber your
edits** — re-running it preserves whatever `show` values you set. New repos default
to `show: true`; forks and archived repos default to `false`.

### Live-link detection (priority order)

1. `liveUrl` override in `data/project-overrides.json`
2. the repo's **Website** field (GitHub `homepage`)
3. GitHub Pages URL (only if Pages is actually on)
4. custom-domain map in `sync-github.ts`
5. nothing → shown as **No Demo**, GitHub link only

The **GitHub** button always points at the repo itself.

## Commands

```bash
npm run sync:github   # refresh public/data from GitHub
npm run dev           # local dev server (uses committed data)
npm run build         # sync + type-check + build for production
npm run build:nosync  # build without hitting GitHub (uses committed data)
npm run preview       # preview the production build
```

### GitHub token

Anonymous GitHub API access caps out at 60 req/hr, which rate-limits the README
fetches fast. Set a token for a full sync:

```bash
GITHUB_TOKEN=github_pat_11ABCDEFG0abcdefghijkl_YouReallyThoughtThisWasRealHuh npm run sync:github
```

> Generate your own token at
> Settings → Developer settings → Personal access tokens. Fine-grained needs
> zero scopes for public repos — read-only public access is enough.

`.github/workflows/sync-projects.yml` runs the sync daily (and on demand) with the
built-in `GITHUB_TOKEN` and commits any data changes.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to **GitHub Pages on every push
to `master`** (Node `24.11.1`). `npm run build` re-syncs from GitHub first, so every
deploy ships a fresh catalog.

- **Custom domain (default):** `public/CNAME` is set to `projects.chakri.me` and the
  Vite `base` is `/`. Point that subdomain's DNS at GitHub Pages and enable Pages
  (Settings → Pages → Source: GitHub Actions).
- **Project-pages subpath instead** (`chakri68.github.io/projects/`): delete
  `public/CNAME` and set `VITE_BASE=/projects/` in the deploy workflow's build step.

## Curation

Edit `data/project-overrides.json`, keyed by repo name. Any repo can set:
`title`, `description`, `category`, `tags`, `featured`, `hidden`, `status`,
`coverImage`, `liveUrl`, `repoUrl`, and `order` (lower sorts first). Manual overrides
always win over fetched data.
