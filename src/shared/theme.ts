import type { Settings } from "./types";

export function applyTheme(theme: Settings["theme"]): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

export function applyDensity(density: Settings["density"]): void {
  document.documentElement.setAttribute("data-density", density);
}

export function applyReduceMotion(reduce: boolean): void {
  document.documentElement.classList.toggle("reduce-motion", reduce);
}
