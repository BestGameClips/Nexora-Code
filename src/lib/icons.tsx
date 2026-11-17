const P: Record<string, string> = {
  files: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-5-5",
  git: "M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9",
  bug: "M8 8h8v8a4 4 0 0 1-8 0zM9 4l1.5 2M15 4l-1.5 2M4 12h4M16 12h4M4 18l4-2M20 18l-4-2",
  ext: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  gear: "M4 7h9M17 7h3M4 17h3M11 17h9M15 5v4M9 15v4",
  file: "M7 3h7l5 5v13H7zM14 3v5h5", chev: "M9 6l6 6-6 6",
  min: "M5 12h14", max: "M6 6h12v12H6z", restore: "M9 9V5h10v10h-4M5 9h10v10H5z", close: "M6 6l12 12M18 6L6 18",
};
export type IconName = keyof typeof P;
export const Icon = ({ n, size = 20, w = 1.6 }: { n: IconName; size?: number; w?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>
);
