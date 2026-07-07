import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

export interface LinkBase {
  /** e.g. https://raw.githubusercontent.com/user/repo/branch/README.md */
  readmeUrl?: string;
  /** e.g. https://github.com/user/repo */
  repoUrl?: string;
}

interface ResolvedBase {
  /** Base for resolving relative image src (raw host). Ends with "/". */
  rawDir: string;
  /** Base for resolving relative link href (github blob). Ends with "/". */
  blobDir: string;
  /** Absolute github blob URL of the README itself (for in-page #anchors). */
  readmeBlob: string;
}

function isAbsolute(url: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//");
}

/** Derive github/raw bases from the README's raw URL. */
function deriveBase(readmeUrl: string): ResolvedBase | null {
  try {
    const u = new URL(readmeUrl);
    const parts = u.pathname.split("/").filter(Boolean); // user, repo, branch, ...path, file
    const [user, repo, branch, ...rest] = parts;
    if (!user || !repo || !branch) return null;
    const file = rest.pop() ?? "README.md";
    const dir = rest.length ? rest.join("/") + "/" : "";
    return {
      rawDir: `https://raw.githubusercontent.com/${user}/${repo}/${branch}/${dir}`,
      blobDir: `https://github.com/${user}/${repo}/blob/${branch}/${dir}`,
      readmeBlob: `https://github.com/${user}/${repo}/blob/${branch}/${dir}${file}`,
    };
  } catch {
    return null;
  }
}

/**
 * Rewrite the rendered HTML so README links/images work off-site:
 *  - relative links     → absolute github blob URLs
 *  - relative images    → absolute raw.githubusercontent URLs
 *  - in-page #anchors    → the README's github anchor (our render has no heading ids)
 *  - every resulting external link opens in a new tab (so it never blows away the SPA)
 */
function rewriteLinks(html: string, opts: LinkBase): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const base = opts.readmeUrl ? deriveBase(opts.readmeUrl) : null;

  doc.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href") ?? "";
    if (!href) return;

    if (href.startsWith("#")) {
      if (base) a.setAttribute("href", base.readmeBlob + href);
    } else if (!isAbsolute(href) && base) {
      try {
        a.setAttribute("href", new URL(href, base.blobDir).href);
      } catch {
        /* leave as-is if unresolvable */
      }
    }

    if (a.getAttribute("href")?.startsWith("http")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener noreferrer");
    }
  });

  doc.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src") ?? "";
    if (!src || isAbsolute(src) || src.startsWith("data:")) return;
    if (base) {
      try {
        img.setAttribute("src", new URL(src, base.rawDir).href);
      } catch {
        /* leave as-is */
      }
    }
  });

  return doc.body.innerHTML;
}

/**
 * Render trusted README markdown (our own repos) to HTML, then rewrite relative
 * links/images to absolute github/raw URLs. Kept sync so callers can drop the
 * result straight into innerHTML during a render pass.
 */
export function renderMarkdown(md: string, opts: LinkBase = {}): string {
  const html = marked.parse(md, { async: false }) as string;
  return rewriteLinks(html, opts);
}
