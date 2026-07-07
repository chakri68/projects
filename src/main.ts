import "./style.css";
import type { Project } from "./types.ts";
import { currentRoute, onRouteChange, type Route } from "./router.ts";
import { mountHome, mountDetail } from "./views.ts";

const BASE = import.meta.env.BASE_URL;
const app = document.querySelector<HTMLDivElement>("#app")!;

let projects: Project[] = [];
let bySlug = new Map<string, Project>();

async function loadProjects(): Promise<Project[]> {
  const res = await fetch(`${BASE}data/projects.json`);
  if (!res.ok) throw new Error(`projects.json ${res.status}`);
  return (await res.json()) as Project[];
}

function applyRoute(r: Route): void {
  window.scrollTo(0, 0);
  if (r.name === "detail") {
    const project = bySlug.get(r.slug);
    if (project) {
      // Renders the skeleton synchronously; README loads + animates after.
      void mountDetail(app, project);
      return;
    }
  }
  mountHome(app, projects);
}

// Morph between home and detail via the View Transitions API where supported;
// otherwise swap instantly. Skipped on reduced-motion.
function route(r: Route): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const startVT = (
    document as Document & {
      startViewTransition?: (cb: () => void) => unknown;
    }
  ).startViewTransition;
  if (startVT && !reduce) {
    startVT.call(document, () => applyRoute(r));
  } else {
    applyRoute(r);
  }
}

function runBootSequence(): void {
  const intro = document.getElementById("intro");
  if (!intro) return;

  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    intro.remove();
    return;
  }

  // Reveal the title, then fly it up and hand off to the app. One shared timeline.
  requestAnimationFrame(() => intro.classList.add("booted"));
  intro.addEventListener(
    "animationend",
    (e) => {
      if ((e as AnimationEvent).animationName === "intro-out") intro.remove();
    },
    { once: true },
  );
  // Safety net in case the animationend event is missed.
  setTimeout(() => intro.remove(), 2600);
}

async function main() {
  try {
    const all = await loadProjects();
    // `show` is the per-project visibility toggle, editable in projects.json.
    projects = all.filter((p) => p.show !== false);
    bySlug = new Map(projects.map((p) => [p.slug, p]));
  } catch (err) {
    app.innerHTML = `
      <div class="page">
        <header class="hero"><h1 class="hero-title">Chakri Labs</h1></header>
        <p class="error">
          Couldn't load project data. Run <code>npm run sync:github</code> to
          generate <code>public/data/projects.json</code>, then reload.
        </p>
      </div>`;
    document.getElementById("intro")?.remove();
    console.error(err);
    return;
  }

  onRouteChange(route);
  applyRoute(currentRoute()); // initial render is behind the boot intro — no transition

  // Kick the boot animation once the pixel font is ready so it never flashes.
  const start = () => runBootSequence();
  if ("fonts" in document) {
    void document.fonts.ready.then(start);
    // Don't wait forever on a slow font load.
    setTimeout(start, 1200);
  } else {
    start();
  }
}

void main();
