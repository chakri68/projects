// Minimal hash router. Routes:
//   #/            → home
//   #/p/<slug>    → project detail
// Hash routing needs no server rewrites, so it works on any static host.

export type Route = { name: "home" } | { name: "detail"; slug: string };

export function parseHash(hash: string): Route {
  const path = hash.replace(/^#/, "").replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  if (parts[0] === "p" && parts[1]) {
    return { name: "detail", slug: decodeURIComponent(parts[1]) };
  }
  return { name: "home" };
}

export function currentRoute(): Route {
  return parseHash(location.hash);
}

export function onRouteChange(handler: (route: Route) => void): void {
  window.addEventListener("hashchange", () => handler(currentRoute()));
}

export function goHome(): void {
  location.hash = "#/";
}
