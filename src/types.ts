// Shared data contracts. Imported by both the build-time sync script (Node) and
// the browser app, so this file must stay free of DOM/Node-specific APIs.

export type ProjectStatus = "live" | "wip" | "archived" | "no-demo" | "fork";

/** Final merged project object rendered by the site. */
export interface Project {
  id: string;
  repoName: string;
  /** URL-safe identifier used in the #/p/<slug> route. */
  slug: string;
  title: string;
  description: string | null;

  repoUrl: string;
  liveUrl?: string;

  category?: string;
  tags: string[];

  language?: string;
  topics: string[];

  stars: number;
  forks: number;

  isArchived: boolean;
  isFork: boolean;
  isFeatured: boolean;

  /**
   * Whether this project is shown on the site. Editable by hand directly in
   * projects.json and PRESERVED across re-sync — flip it to hide/show a repo
   * without touching overrides. New repos default to true (forks/archived to
   * false).
   */
  show: boolean;

  status: ProjectStatus;

  /** True when a README was found; drives detail-page availability + sort order. */
  hasReadme: boolean;
  /** Raw README URL fetched at runtime on the detail page, when present. */
  readmeUrl?: string;

  coverImage?: string;

  createdAt: string;
  updatedAt: string;
  pushedAt: string;
}

/** Manual, hand-authored curation applied on top of fetched repo data. */
export interface ProjectOverride {
  title?: string;
  description?: string;
  category?: string;
  tags?: string[];
  featured?: boolean;
  hidden?: boolean;
  status?: ProjectStatus;
  coverImage?: string;
  /** Force a specific live/demo URL (highest priority in detection). */
  liveUrl?: string;
  /** Force a specific repo URL. */
  repoUrl?: string;
  /** Explicit display order; lower numbers sort first, before the default sort. */
  order?: number;
}

export type OverridesFile = Record<string, ProjectOverride>;
