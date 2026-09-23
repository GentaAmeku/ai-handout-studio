// 右のサイドパネルの幅。編集画面とデザインページが同じ値を覚えて使う

const SIDE_WIDTH_KEY = "ai-handout-studio:side-width";
const SIDE_WIDTH_DEFAULT = 360;
export const SIDE_WIDTH_MIN = 300;
export const SIDE_WIDTH_MAX = 560;

const clampSideWidth = (value: number): number =>
  Math.min(SIDE_WIDTH_MAX, Math.max(SIDE_WIDTH_MIN, Math.round(value)));

export const readSideWidth = (): number => {
  const raw = Number(localStorage.getItem(SIDE_WIDTH_KEY));
  return Number.isFinite(raw) && raw !== 0
    ? clampSideWidth(raw)
    : SIDE_WIDTH_DEFAULT;
};

export const writeSideWidth = (width: number): void => {
  localStorage.setItem(SIDE_WIDTH_KEY, String(width));
};

// パネルを畳んだかどうか。畳んでも幅の値は残し、開いたら元の幅に戻す

const SIDE_OPEN_KEY = "ai-handout-studio:side-open";

export const readSideOpen = (): boolean =>
  localStorage.getItem(SIDE_OPEN_KEY) !== "closed";

export const writeSideOpen = (open: boolean): void => {
  localStorage.setItem(SIDE_OPEN_KEY, open ? "open" : "closed");
};
