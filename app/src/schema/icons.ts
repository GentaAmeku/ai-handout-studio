// 使えるアイコン名。描画側(blocks/icons.tsx)はこの名前すべてに線画を持つ
export const iconNames = [
  "target",
  "trending-up",
  "book-open",
  "settings",
  "circle-check",
  "lightbulb",
  "users",
  "chart-column",
  "flag",
  "clock",
  "shield-check",
  "rocket",
  "message-circle",
  "file-text",
  "search",
  "wrench",
  "sparkles",
] as const;

export type IconName = (typeof iconNames)[number];

export const isIconName = (value: string): value is IconName =>
  (iconNames as readonly string[]).includes(value);
