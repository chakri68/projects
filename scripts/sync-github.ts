/**
 * Build-time GitHub sync.
 *
 * Fetches all public repos for GITHUB_USER, detects each repo's README URL +
 * GitHub Pages metadata, detects a live URL, merges hand-authored overrides,
 * sorts, and writes the single committed file the site reads:
 *
 *   public/data/projects.json        final merged + sorted project list
 *
 * README markdown is NOT downloaded here — each project carries a `readmeUrl`
 * that the detail page fetches live in the browser. The per-project `show` flag
 * is preserved across re-syncs so hand edits survive.
 *
 * Designed to never hard-fail the build for transient issues: on a failed fetch
 * it falls back to the previously committed projects.json so a flaky GitHub API
 * or missing token can't take the site down.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  OverridesFile,
  Project,
  ProjectOverride,
  ProjectStatus,
} from "../src/types.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const USER = process.env.GITHUB_USER || "chakri68";
const TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

const OVERRIDES_PATH = join(ROOT, "data", "project-overrides.json");
const DATA_DIR = join(ROOT, "public", "data");
const PROJECTS_OUT = join(DATA_DIR, "projects.json");

/** Custom-domain map, checked after homepage/pages (design §7.2 priority 4). */
const CUSTOM_DOMAINS: Record<string, string> = {
  // "gameboy": "https://gameboy.chakri.me",
};

// ---- GitHub REST shapes (only the fields we use) ---------------------------

interface GhRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  homepage: string | null;
  html_url: string;
  language: string | null;
  topics?: string[];
  stargazers_count: number;
  forks_count: number;
  archived: boolean;
  fork: boolean;
  visibility?: string;
  private: boolean;
  created_at: string;
  updated_at: string;
  pushed_at: string;
  has_pages?: boolean;
  default_branch: string;
}

// ---- HTTP helpers ----------------------------------------------------------

function ghHeaders(accept = "application/vnd.github+json"): HeadersInit {
  const h: Record<string, string> = {
    Accept: accept,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "chakri-labs-sync",
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

async function ghJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} ${res.statusText} for ${url}`);
  }
  return (await res.json()) as T;
}

/** Fetch every owner-affiliated public repo, following pagination. */
async function fetchAllRepos(user: string): Promise<GhRepo[]> {
  const repos: GhRepo[] = [];
  for (let page = 1; ; page++) {
    const url =
      `https://api.github.com/users/${user}/repos` +
      `?per_page=100&page=${page}&sort=updated&type=owner`;
    const batch = await ghJson<GhRepo[]>(url);
    repos.push(...batch);
    if (batch.length < 100) break;
  }
  return repos;
}

/** Candidate README filenames, most common first. */
const README_CANDIDATES = [
  "README.md",
  "readme.md",
  "Readme.md",
  "README.markdown",
];

/**
 * Detect a README via raw.githubusercontent.com (no GitHub API rate limit, and
 * CORS-enabled so the browser can fetch the same URL at runtime). Returns the
 * raw URL if found — we never download or commit the content; the detail page
 * fetches it live.
 */
async function detectReadmeUrl(
  user: string,
  repo: string,
  branch: string,
): Promise<string | null> {
  for (const name of README_CANDIDATES) {
    const url = `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${name}`;
    try {
      const res = await fetch(url, { method: "HEAD" });
      if (res.ok) return url;
    } catch {
      // network hiccup on one candidate — try the next
    }
  }
  return null;
}

/** GitHub Pages html_url if Pages is enabled, else null. Needs auth for some repos. */
async function fetchPagesUrl(user: string, repo: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${user}/${repo}/pages`, {
    headers: ghHeaders(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { html_url?: string };
  return data.html_url ?? null;
}

// ---- Transforms ------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function isValidUrl(u: string | null | undefined): u is string {
  if (!u) return false;
  try {
    const parsed = new URL(u);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/** Live-link detection priority ladder (design §7.2). */
function detectLiveUrl(
  repo: GhRepo,
  override: ProjectOverride | undefined,
  pagesUrl: string | null,
): string | undefined {
  if (isValidUrl(override?.liveUrl)) return override!.liveUrl;
  if (isValidUrl(repo.homepage)) return repo.homepage!;
  if (isValidUrl(pagesUrl)) return pagesUrl!;
  const custom = CUSTOM_DOMAINS[repo.name];
  if (isValidUrl(custom)) return custom;
  return undefined;
}

function deriveStatus(repo: GhRepo, liveUrl: string | undefined): ProjectStatus {
  if (repo.archived) return "archived";
  if (liveUrl) return "live";
  if (repo.fork) return "fork";
  // No demo but recently pushed → treat as work in progress.
  const pushedRecently =
    Date.now() - new Date(repo.pushed_at).getTime() < 1000 * 60 * 60 * 24 * 60;
  return pushedRecently ? "wip" : "no-demo";
}

function applyOverride(base: Project, o: ProjectOverride | undefined): Project {
  if (!o) return base;
  return {
    ...base,
    title: o.title ?? base.title,
    description: o.description ?? base.description,
    category: o.category ?? base.category,
    tags: o.tags ?? base.tags,
    isFeatured: o.featured ?? base.isFeatured,
    status: o.status ?? base.status,
    coverImage: o.coverImage ?? base.coverImage,
    liveUrl: isValidUrl(o.liveUrl) ? o.liveUrl : base.liveUrl,
    repoUrl: isValidUrl(o.repoUrl) ? o.repoUrl! : base.repoUrl,
  };
}

/**
 * Default sort: manual order → featured → has-README → live → recently updated.
 * README-bearing repos float up because they get a real detail page.
 */
function projectSort(
  a: Project,
  b: Project,
  order: Record<string, number>,
): number {
  const ao = order[a.repoName] ?? Infinity;
  const bo = order[b.repoName] ?? Infinity;
  if (ao !== bo) return ao - bo;

  if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
  if (a.hasReadme !== b.hasReadme) return a.hasReadme ? -1 : 1;

  const aLive = a.status === "live";
  const bLive = b.status === "live";
  if (aLive !== bLive) return aLive ? -1 : 1;

  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}

// ---- Main ------------------------------------------------------------------

async function readOverrides(): Promise<OverridesFile> {
  if (!existsSync(OVERRIDES_PATH)) return {};
  try {
    return JSON.parse(await readFile(OVERRIDES_PATH, "utf8")) as OverridesFile;
  } catch (err) {
    // Malformed overrides is a real config error — fail loudly (design §18).
    throw new Error(`Invalid ${OVERRIDES_PATH}: ${(err as Error).message}`);
  }
}

/**
 * Read the `show` flag committed for each repo in the previous projects.json so
 * hand edits survive re-sync. Keyed by repoName.
 */
async function readPreviousShow(): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>();
  if (!existsSync(PROJECTS_OUT)) return map;
  try {
    const prev = JSON.parse(await readFile(PROJECTS_OUT, "utf8")) as Project[];
    for (const p of prev) {
      if (typeof p.show === "boolean") map.set(p.repoName, p.show);
    }
  } catch {
    // Unreadable previous file → just fall back to defaults.
  }
  return map;
}

/**
 * Decide the default `show` for a repo on first sight. Preserved values (from a
 * previous projects.json) always win over this — see main().
 */
function defaultShow(repo: GhRepo, override: ProjectOverride | undefined): boolean {
  if (override?.hidden) return false;
  // Auto-hide forks + archived by default (design §19); everything else shows.
  if (repo.fork || repo.archived) return false;
  return true;
}

async function main() {
  console.log(`> syncing github.com/${USER}${TOKEN ? " (authenticated)" : " (anonymous)"}`);
  const overrides = await readOverrides();
  const previousShow = await readPreviousShow();

  let repos: GhRepo[];
  try {
    repos = await fetchAllRepos(USER);
  } catch (err) {
    console.error(`! repo fetch failed: ${(err as Error).message}`);
    if (existsSync(PROJECTS_OUT)) {
      console.warn("! keeping previously committed projects.json");
      return;
    }
    throw err;
  }
  console.log(`> ${repos.length} repos fetched`);

  await mkdir(DATA_DIR, { recursive: true });

  const projects: Project[] = [];
  for (const repo of repos) {
    const override = overrides[repo.name];
    const slug = slugify(repo.name);

    // README detected from raw.githubusercontent (no API limit); fetched live in
    // the browser. Pages metadata only when the repo actually has Pages.
    const [readmeUrl, pagesUrl] = await Promise.all([
      detectReadmeUrl(USER, repo.name, repo.default_branch),
      repo.has_pages ? fetchPagesUrl(USER, repo.name) : Promise.resolve(null),
    ]);

    const liveUrl = detectLiveUrl(repo, override, pagesUrl);

    // Preserve a hand-edited `show`; otherwise fall back to the default.
    const show = previousShow.get(repo.name) ?? defaultShow(repo, override);

    const base: Project = {
      id: String(repo.id),
      repoName: repo.name,
      slug,
      title: repo.name,
      description: repo.description,
      repoUrl: repo.html_url,
      liveUrl,
      tags: repo.topics ?? [],
      language: repo.language ?? undefined,
      topics: repo.topics ?? [],
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      isArchived: repo.archived,
      isFork: repo.fork,
      isFeatured: false,
      show,
      status: deriveStatus(repo, liveUrl),
      hasReadme: readmeUrl != null,
      readmeUrl: readmeUrl ?? undefined,
      createdAt: repo.created_at,
      updatedAt: repo.updated_at,
      pushedAt: repo.pushed_at,
    };

    projects.push(applyOverride(base, override));
  }

  const order: Record<string, number> = {};
  for (const [name, o] of Object.entries(overrides)) {
    if (typeof o.order === "number") order[name] = o.order;
  }

  // Every repo is written (so `show` is toggleable per project); the app renders
  // only those with show !== false.
  const sorted = projects.sort((a, b) => projectSort(a, b, order));

  await writeFile(PROJECTS_OUT, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  const shown = sorted.filter((p) => p.show);
  console.log(
    `> wrote ${sorted.length} projects (${shown.length} shown, ${
      shown.filter((p) => p.hasReadme).length
    } with README) → public/data/projects.json`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
