export interface ThemeDef { id: string; name: string; base: "dark" | "light"; vars: Record<"bg" | "bg2" | "bg3" | "bg4" | "fg" | "fg2" | "bd" | "ac" | "acf" | "sel", string>; }
const T = (id: string, name: string, base: "dark" | "light", v: string): ThemeDef => {
  const [bg, bg2, bg3, bg4, fg, fg2, bd, ac, acf, sel] = v.split(" ");
  return { id, name, base, vars: { bg, bg2, bg3, bg4, fg, fg2, bd, ac, acf, sel } };
};
export const THEMES: ThemeDef[] = [
  T("obsidian", "Obsidian Dark", "dark", "#0b0c0f #121317 #1b1d23 #252830 #e8eaee #8f96a3 #23262d #3fb68b #06120d #1f3d33"),
  T("midnight-blue", "Midnight Blue", "dark", "#0f1626 #141d31 #1c2740 #263454 #e4eaf7 #8e9bb8 #243150 #5b9cff #07101f #213a66"),
  T("royal-violet", "Royal Violet", "dark", "#17121f #1e1829 #2a2139 #372c4a #ece7f6 #a094b8 #302742 #a77bf0 #130c1e #3d2d62"),
  T("emerald-night", "Emerald Night", "dark", "#0d1a17 #12231f #1a322c #234239 #e2f3ee #86aaa0 #1f3a33 #34d399 #04140e #1d4a3b"),
  T("graphite", "Graphite", "dark", "#1e1f22 #26282c #303338 #3b3f45 #dfe1e5 #9a9fa8 #34373d #8ab4f8 #0c1524 #34445e"),
  T("ocean-cyan", "Ocean Cyan", "dark", "#0b1b21 #0f242c #16333d #1e4452 #e0f4f8 #80aab5 #1b3a45 #22d3ee #031418 #17495a"),
  T("sunset-orange", "Sunset Orange", "dark", "#1c1411 #251a15 #33241c #443126 #f6e9e1 #b49a8b #3a2a21 #fb923c #1c0d03 #5a3417"),
  T("hc-dark", "High Contrast Dark", "dark", "#000000 #0a0a0a #1a1a1a #2b2b2b #ffffff #e0e0e0 #ffffff #ffd700 #000000 #1a3a8a"),
  T("arctic-light", "Arctic Light", "light", "#f8fafc #eef2f7 #e1e7ef #d2dae6 #18202c #566275 #d0d8e4 #2563eb #ffffff #cfe0ff"),
  T("rose-quartz", "Rose Quartz", "light", "#fdf7f8 #f8ecee #f0dde1 #e6cbd2 #2a1a1e #7a5a63 #ebd3d9 #d6336c #ffffff #f8cfdc"),
  T("hc-light", "High Contrast Light", "light", "#ffffff #f2f2f2 #e6e6e6 #d0d0d0 #000000 #1a1a1a #000000 #0000cc #ffffff #b3d4ff"),
];
export const themeById = (id: string) => THEMES.find((t) => t.id === id) ?? THEMES[0];
export function applyTheme(t: ThemeDef) {
  const r = document.documentElement;
  r.dataset.themeId = t.id;
  Object.entries(t.vars).forEach(([k, v]) => r.style.setProperty("--" + k, v));
}
