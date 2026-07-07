# Chakri Labs

A living archive of projects, experiments, simulations, tools, and side quests —
a self-updating catalog generated from GitHub. Vite + vanilla TypeScript, no
framework. Amber-phosphor terminal theme (see [`ui_theme.md`](./ui_theme.md));
product spec in [`design.md`](./design.md).

## How it works

1. `scripts/sync-github.ts` fetches every public repo for `GITHUB_USER`
   (default `chakri68`), detects each repo's README (via `raw.githubusercontent.com`
   — no API rate limit) and GitHub Pages metadata.
2. It merges hand-authored curation from `data/project-overrides.json`, detects
   each project's live link, sorts, and writes the single committed file
   `public/data/projects.json` (the merged, sorted project list). README markdown
   is **not** committed — each project stores a `readmeUrl` that the detail page
   fetches live in the browser.
3. The app reads that data at runtime. Repos **with a README** get a detail page
   (`#/p/<slug>`) and sort first; repos without one are cards that link to GitHub.

### Showing / hiding a project

Every project in `projects.json` has a `show` boolean. Flip it to `false` to hide
a project (or `true` to reveal a fork/archived repo). **Sync preserves your edited
`show` values** — re-running the sync won't overwrite them. New repos default to
`show: true`; forks and archived repos default to `false`.

### Live-link detection (priority order)

1. `liveUrl` override in `data/project-overrides.json`
2. the repo's **Website** field (GitHub `homepage`)
3. GitHub Pages URL (only if Pages is actually enabled)
4. custom-domain map in `sync-github.ts`
5. none → shown as **No Demo**, GitHub link only

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

Anonymous GitHub API access is limited to 60 req/hr, which rate-limits README
fetches. Set a token for the full sync:

```bash
GITHUB_TOKEN=ghp_xxx npm run sync:github
```

`.github/workflows/sync-projects.yml` runs the sync daily (and on demand) with
the built-in `GITHUB_TOKEN` and commits any data changes.

## Deployment

`.github/workflows/deploy.yml` builds and deploys to **GitHub Pages on every push
to `master`** (Node `24.11.1`). `npm run build` re-syncs from GitHub first, so each
deploy publishes a fresh catalog.

- **Custom domain (default):** `public/CNAME` is set to `projects.chakri.me` and the
  Vite `base` is `/`. Point that subdomain's DNS at GitHub Pages and enable Pages
  (Settings → Pages → Source: GitHub Actions).
- **Project-pages subpath instead** (`chakri68.github.io/projects/`): delete
  `public/CNAME` and set `VITE_BASE=/projects/` in the deploy workflow's build step.

## Curation

Edit `data/project-overrides.json`, keyed by repo name. Any repo can set:
`title`, `description`, `category`, `tags`, `featured`, `hidden`, `status`,
`coverImage`, `liveUrl`, `repoUrl`, and `order` (lower sorts first). Manual
overrides always win over fetched data.
