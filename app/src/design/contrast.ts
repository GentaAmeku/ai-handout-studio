import type { Tokens } from "../schema/design.ts";
import { contrastRatio } from "./theme.ts";

// 文字と地の組み合わせ。画面とスライドで実際に重なるものを並べる。
// テスト(theme.test.ts)とデザインページの保存時の検査が同じ一覧を使う

type ColorKey = keyof Tokens["color"];

export const BODY_MIN_RATIO = 4.5;

// 4.5 に届かない組み合わせ。どれもスライドの意匠が決めた色で、見た目を変えないため
// 悪化させないよう 3 以上だけを見る。質問票と文書はこの組を使わない(段 E)
export const KNOWN_LOW_MIN_RATIO = 3;

export const bodyPairs: readonly (readonly [ColorKey, ColorKey])[] = [
  ["text", "bg"],
  ["text", "surface"],
  ["text", "tint"],
  ["text", "lavender"],
  ["text", "chip"],
  ["muted", "bg"],
  ["muted", "surface"],
  ["onPrimary", "primaryStrong"],
  // 文書と質問票(段 D)。状態の文字と、ボタン・表の中の強い青
  ["success", "bg"],
  ["success", "successTint"],
  ["warning", "bg"],
  ["warning", "warningTint"],
  ["primaryStrong", "bg"],
  ["primaryStrong", "surface"],
  ["text", "successTint"],
  ["text", "warningTint"],
  ["text", "dangerTint"],
  // 見出しとリンク。focusRing は白地との明暗差が低い前提の色なのでここに入れない
  ["heading", "bg"],
  ["link", "bg"],
  ["linkVisited", "bg"],
  // ボタンの hover・押した地の上の文字。warningAccent は帯の飾りなのでここに入れない
  ["primaryStrong", "primaryHoverTint"],
  ["onPrimary", "primaryPressed"],
];

export const knownLowPairs: readonly (readonly [ColorKey, ColorKey])[] = [
  ["primary", "bg"],
  ["primary", "tint"],
  ["primary", "lavender"],
  ["muted", "lavender"],
  ["onPrimary", "primary"],
  ["danger", "dangerTint"],
  // 差し色。カードの地・数値の文字・注意の帯に使う(design/components.json)。
  // 地に使ったときの文字は、その文字を決めるテンプレートが見る(text との組は既定でしか成り立たない)
  ["accent2", "bg"],
  ["accent2", "surface"],
  ["accent3", "bg"],
  ["accent3", "surface"],
];

// 枠(border)と地の組。文字ではないので 3 以上(非文字のコントラストの下限)で足りるが、
// 既定のテンプレートは検査していない値なので、strictContrast のテンプレートだけに求める
export const borderPairs: readonly (readonly [ColorKey, ColorKey])[] = [
  ["border", "bg"],
  // 強い罫・引用の線。字ではないので3以上で足りる
  ["rule", "bg"],
  ["quote", "bg"],
];

export type ContrastCheck = {
  foreground: ColorKey;
  background: ColorKey;
  ratio: number;
  min: number;
  ok: boolean;
};

// #RRGGBB かどうか。任意のキーは値が無いこともあるので、その場合も外す
const isHex = (value: string | undefined): value is string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

// rgb() の色・任意のキーの未設定は計算しない(透明度を含むため)。一覧の色はどれも #RRGGBB
// strictContrast: 真のテンプレートには「低くてよい組」の例外を当てず、4.5 を求める。
// 代わりに枠(border)と地の組を 3 以上で見る(§85)
export const checkContrast = (
  color: Tokens["color"],
  options?: { strictContrast?: boolean },
): ContrastCheck[] => {
  const strict = options?.strictContrast ?? false;
  return [
    ...bodyPairs.map((pair) => [pair, BODY_MIN_RATIO] as const),
    ...knownLowPairs.map(
      (pair) => [pair, strict ? BODY_MIN_RATIO : KNOWN_LOW_MIN_RATIO] as const,
    ),
    ...(strict
      ? borderPairs.map((pair) => [pair, KNOWN_LOW_MIN_RATIO] as const)
      : []),
  ].flatMap(([[foreground, background], min]) => {
    const fg = color[foreground];
    const bg = color[background];
    if (!isHex(fg) || !isHex(bg)) return [];
    const ratio = contrastRatio(fg, bg);
    return [{ foreground, background, ratio, min, ok: ratio >= min }];
  });
};
