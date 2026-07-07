import type { Project, ProjectStatus } from "./types.ts";
import { renderMarkdown } from "./markdown.ts";
import { goHome } from "./router.ts";

// ---- small utilities -------------------------------------------------------

function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

const STATUS_LABEL: Record<ProjectStatus, string> = {
  live: "LIVE",
  wip: "WIP",
  archived: "ARCHIVED",
  "no-demo": "NO DEMO",
  fork: "FORK",
};

function statusBadge(p: Project): string {
  return `<span class="badge badge-${p.status}">${STATUS_LABEL[p.status]}</span>`;
}

// ---- card ------------------------------------------------------------------

function cardHtml(p: Project): string {
  const meta = [p.language, p.category, ...p.topics.slice(0, 2)]
    .filter(Boolean)
    .map((t) => esc(t as string))
    .join(" · ");

  const links: string[] = [];
  if (p.liveUrl) {
    links.push(
      `<a class="btn primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">Live Demo</a>`,
    );
  }
  links.push(
    `<a class="btn" href="${esc(p.repoUrl)}" target="_blank" rel="noopener">GitHub</a>`,
  );

  // Whole card links to the detail page only when there's a README to show. The
  // clicked card's title is tagged with the shared transition name at click time
  // (see mountHome) so only that one element morphs into the detail heading.
  const titleHtml = p.hasReadme
    ? `<a class="card-title-link" href="#/p/${esc(p.slug)}">${esc(p.title)}</a>`
    : `<span class="card-title-plain">${esc(p.title)}</span>`;

  const badges =
    (p.isFeatured ? `<span class="badge badge-featured">FEATURED</span>` : "") +
    statusBadge(p);

  const stars =
    p.stars > 0
      ? `<span class="stat" title="stars">★ <span class="num">${p.stars}</span></span>`
      : "";

  return `
    <article class="card${p.isFeatured ? " is-featured" : ""}${
      p.hasReadme ? " clickable" : ""
    }" data-slug="${esc(p.slug)}"${p.hasReadme ? ' data-nav="1"' : ""}>
      <div class="card-badges">${badges}</div>
      <h3 class="card-title">${titleHtml}</h3>
      <p class="card-desc">${esc(p.description) || "<span class=\"muted\">No description.</span>"}</p>
      <div class="card-meta">${meta}</div>
      <div class="card-foot">
        <div class="card-links">${links.join("")}</div>
        <div class="card-stats">
          ${stars}
          <span class="stat muted">Updated ${monthYear(p.updatedAt)}</span>
        </div>
      </div>
    </article>`;
}

// ---- filtering / sorting state ---------------------------------------------

interface FilterDef {
  key: string;
  label: string;
  match: (p: Project) => boolean;
}

function buildFilters(projects: Project[]): FilterDef[] {
  const base: FilterDef[] = [
    { key: "all", label: "All", match: () => true },
    { key: "featured", label: "Featured", match: (p) => p.isFeatured },
    { key: "live", label: "Live", match: (p) => p.status === "live" },
    { key: "no-demo", label: "No Demo", match: (p) => p.status === "no-demo" },
    { key: "archived", label: "Archived", match: (p) => p.status === "archived" },
  ];

  const categories = [...new Set(projects.map((p) => p.category).filter(Boolean))]
    .sort() as string[];
  for (const cat of categories) {
    base.push({
      key: `cat:${cat}`,
      label: cat,
      match: (p) => p.category === cat,
    });
  }
  return base;
}

type SortKey = "curated" | "updated" | "stars" | "alpha";

function sortProjects(projects: Project[], key: SortKey): Project[] {
  const arr = [...projects];
  switch (key) {
    case "updated":
      return arr.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
    case "stars":
      return arr.sort((a, b) => b.stars - a.stars);
    case "alpha":
      return arr.sort((a, b) => a.title.localeCompare(b.title));
    case "curated":
    default:
      return arr; // already curated-sorted by the build step
  }
}

function matchesQuery(p: Project, q: string): boolean {
  if (!q) return true;
  const hay = [
    p.title,
    p.description ?? "",
    p.language ?? "",
    p.category ?? "",
    ...p.tags,
    ...p.topics,
  ]
    .join(" ")
    .toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => hay.includes(term));
}

// ---- home view -------------------------------------------------------------

export function mountHome(app: HTMLElement, projects: Project[]): void {
  const filters = buildFilters(projects);
  const state = { filter: "all", query: "", sort: "curated" as SortKey };

  const featured = projects.filter((p) => p.isFeatured);

  app.innerHTML = `
    <div class="page">
      <header class="hero">
        <h1 class="hero-title">Chakri Labs</h1>
        <p class="hero-sub">
          A living archive of projects, experiments, simulations, tools, and side quests.
        </p>
      </header>

      <section class="controls">
        <input
          id="search"
          class="search"
          type="text"
          placeholder="Search projects…"
          autocomplete="off"
          spellcheck="false"
        />
        <div class="chips" id="chips">
          ${filters
            .map(
              (f) =>
                `<button class="chip${f.key === "all" ? " on" : ""}" data-filter="${esc(
                  f.key,
                )}">${esc(f.label)}</button>`,
            )
            .join("")}
        </div>
        <div class="sort-wrap">
          <label class="sort-label" for="sort">Sort</label>
          <select id="sort" class="sort">
            <option value="curated">Curated</option>
            <option value="updated">Recently updated</option>
            <option value="stars">Most starred</option>
            <option value="alpha">Alphabetical</option>
          </select>
        </div>
      </section>

      ${
        featured.length
          ? `<section class="section">
               <h2 class="section-head">Featured</h2>
               <div class="grid">${featured.map(cardHtml).join("")}</div>
             </section>`
          : ""
      }

      <section class="section">
        <h2 class="section-head">All Projects <span class="count" id="count"></span></h2>
        <div class="grid" id="grid"></div>
      </section>

      <footer class="foot">
        <span>Built from GitHub, curated by hand, occasionally held together by hope.</span>
        <span class="foot-links">
          <a href="https://chakri.me" target="_blank" rel="noopener">chakri.me</a>
          <a href="https://github.com/chakri68" target="_blank" rel="noopener">GitHub</a>
        </span>
      </footer>
    </div>`;

  const grid = app.querySelector<HTMLElement>("#grid")!;
  const count = app.querySelector<HTMLElement>("#count")!;
  const search = app.querySelector<HTMLInputElement>("#search")!;
  const chips = app.querySelector<HTMLElement>("#chips")!;
  const sort = app.querySelector<HTMLSelectElement>("#sort")!;

  function render() {
    const def = filters.find((f) => f.key === state.filter) ?? filters[0];
    const filtered = projects.filter(
      (p) => def.match(p) && matchesQuery(p, state.query),
    );
    const sorted = sortProjects(filtered, state.sort);
    grid.innerHTML = sorted.length
      ? sorted.map(cardHtml).join("")
      : `<p class="empty">No projects match — clear the search or pick another filter.</p>`;
    count.textContent = `(${sorted.length})`;
  }

  search.addEventListener("input", () => {
    state.query = search.value;
    render();
  });

  sort.addEventListener("change", () => {
    state.sort = sort.value as SortKey;
    render();
  });

  chips.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(".chip");
    if (!btn) return;
    state.filter = btn.dataset.filter!;
    chips.querySelectorAll(".chip").forEach((c) => c.classList.remove("on"));
    btn.classList.add("on");
    render();
  });

  // Whole-card click (including the title link) navigates to the detail page;
  // the external action buttons still open normally. Tag the clicked title so it
  // — and only it — morphs into the detail heading.
  app.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest(".btn")) return; // Live Demo / GitHub open externally
    const card = t.closest<HTMLElement>(".card.clickable[data-nav]");
    if (!card?.dataset.slug) return;
    e.preventDefault(); // handle nav ourselves (covers the title <a>)
    const title = card.querySelector<HTMLElement>(".card-title");
    if (title) title.style.viewTransitionName = "vt-active";
    location.hash = `#/p/${card.dataset.slug}`;
  });

  render();
}

// ---- detail view -----------------------------------------------------------

export async function mountDetail(app: HTMLElement, p: Project): Promise<void> {
  const links: string[] = [];
  if (p.liveUrl) {
    links.push(
      `<a class="btn primary" href="${esc(p.liveUrl)}" target="_blank" rel="noopener">Live Demo</a>`,
    );
  }
  links.push(
    `<a class="btn" href="${esc(p.repoUrl)}" target="_blank" rel="noopener">View on GitHub</a>`,
  );

  const facts = [
    p.language ? `<span class="fact"><span class="k">Language</span> ${esc(p.language)}</span>` : "",
    `<span class="fact"><span class="k">Stars</span> <span class="num">${p.stars}</span></span>`,
    `<span class="fact"><span class="k">Forks</span> <span class="num">${p.forks}</span></span>`,
    `<span class="fact"><span class="k">Updated</span> ${monthYear(p.updatedAt)}</span>`,
    `<span class="fact"><span class="k">Created</span> ${monthYear(p.createdAt)}</span>`,
  ]
    .filter(Boolean)
    .join("");

  const tags = p.tags.length
    ? `<div class="chips readonly">${p.tags
        .map((t) => `<span class="chip on">${esc(t)}</span>`)
        .join("")}</div>`
    : "";

  app.innerHTML = `
    <div class="page detail">
      <button class="back" id="back">&larr; back to archive</button>

      <header class="detail-head">
        <div class="card-badges">
          ${p.isFeatured ? `<span class="badge badge-featured">FEATURED</span>` : ""}
          ${statusBadge(p)}
        </div>
        <h1 class="detail-title"${
          p.hasReadme ? ` style="view-transition-name: vt-active"` : ""
        }>${esc(p.title)}</h1>
        <p class="detail-desc">${esc(p.description) || ""}</p>
        <div class="detail-links">${links.join("")}</div>
        <div class="facts">${facts}</div>
        ${tags}
      </header>

      <article class="readme" id="readme">
        ${
          p.hasReadme
            ? `<p class="readme-loading">&gt; fetching README<span class="dots"></span><span class="cursor"></span></p>`
            : `<p class="muted">This project has no README.</p>`
        }
      </article>
    </div>`;

  app.querySelector<HTMLButtonElement>("#back")!.addEventListener("click", goHome);

  if (p.hasReadme && p.readmeUrl) {
    const target = app.querySelector<HTMLElement>("#readme")!;
    try {
      // Fetched live from raw.githubusercontent.com (CORS-enabled).
      const res = await fetch(p.readmeUrl);
      if (!res.ok) throw new Error(String(res.status));
      const md = await res.text();
      target.innerHTML = renderMarkdown(md);
      revealBlocks(target);
    } catch {
      target.innerHTML = `<p class="error">Couldn't load the README. <a href="${esc(
        p.repoUrl,
      )}" target="_blank" rel="noopener">Read it on GitHub</a>.</p>`;
    }
  }
}

/**
 * Terminal "boot-in" reveal: top-level README blocks fade/slide up in sequence.
 * The per-block delay is capped so long READMEs don't crawl in forever.
 */
function revealBlocks(container: HTMLElement): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) return;
  container.classList.add("reveal");
  const children = Array.from(container.children) as HTMLElement[];
  children.forEach((el, i) => {
    el.style.setProperty("--i", String(Math.min(i, 24)));
  });
}
