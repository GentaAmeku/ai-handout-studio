import type { SnippetSegment } from "../../src/api/types.ts";
import { normalize, termsOf } from "../../src/search/match.ts";
import { bigramsOf } from "./score.ts";

// 行の2行目に出す、当たった所の前後の文。
// 打った語がそのまま入っていればその字に印、無ければ打った文と3字以上続けて重なった所に印を付ける

const WIDTH = 70;
const LEAD = 18;
const MIN_RUN = 3;

// 表の縦線と区切り線(---)・見出しの印・コードの囲みは読む邪魔なので空白にし、改行もまとめて1行にする
export const flatten = (text: string): string =>
  text
    .replace(/^#{1,3} /gm, "")
    .replace(/[|`]+/g, " ")
    .replace(/-{3,}/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// 1字ずつそろえ、そろえた後の文字列での頭の位置を持つ(NFKC で字数が変わる字があっても元の字へ戻せる)
const piecesOf = (chars: readonly string[]) => {
  const pieces = chars.map((char) => normalize(char));
  // そろえた字の長さを頭から足していく
  const starts = pieces.reduce<number[]>((acc, _piece, index) => {
    acc.push(
      index === 0
        ? 0
        : (acc[index - 1] ?? 0) + (pieces[index - 1]?.length ?? 0),
    );
    return acc;
  }, []);
  return { pieces, starts, joined: pieces.join("") };
};

// 英語の、どこにでも出る短い語。印にすると「comm[an]d」のように本文じゅうに散るので付けない
const ENGLISH_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "our",
  "that",
  "the",
  "this",
  "to",
  "we",
  "with",
  "you",
  "your",
]);

// 英字と数字だけの語は、単語の切れ目でだけ当てる(「it」を「situation」の中で当てない)。
// 日本語の語は切れ目が無いので、どこでも当てる
const termPattern = (term: string): RegExp | undefined => {
  if (!/^[\x20-\x7e]+$/.test(term)) return new RegExp(escapeRegExp(term), "g");
  if (ENGLISH_STOP_WORDS.has(term)) return undefined;
  return new RegExp(`(?<![a-z0-9])${escapeRegExp(term)}(?![a-z0-9])`, "g");
};

const exactHits = (
  chars: readonly string[],
  terms: readonly string[],
): boolean[] => {
  const { pieces, starts, joined } = piecesOf(chars);
  const ranges = terms.flatMap((term) => {
    const pattern = termPattern(term);
    return pattern
      ? [...joined.matchAll(pattern)].map(
          (match) => [match.index, match.index + term.length] as const,
        )
      : [];
  });
  return chars.map((_char, index) => {
    const start = starts[index] ?? 0;
    const end = start + (pieces[index]?.length ?? 0);
    return ranges.some(([from, to]) => start < to && end > from);
  });
};

// 打った文の片(2字)が続けて重なった所。MIN_RUN 字に満たない重なりは印にしない
const runHits = (chars: readonly string[], query: string): boolean[] => {
  const grams = new Set(bigramsOf(query));
  const covered = chars.map((_char, index) => {
    const left =
      index > 0 && grams.has(normalize(`${chars[index - 1]}${chars[index]}`));
    const right =
      index < chars.length - 1 &&
      grams.has(normalize(`${chars[index]}${chars[index + 1]}`));
    return left || right;
  });
  // 続けて重なった所を [始め, 終わり) の並びにする
  const runs = covered
    .flatMap((hit, index) => (hit && !covered[index - 1] ? [index] : []))
    .map((start) => {
      const stop = covered.indexOf(false, start);
      return { start, end: stop === -1 ? covered.length : stop };
    });
  // 2文字の片の重なりは日本語のための決まり。英字と数字だけの重なりは印にしない
  // (英語は、打った語とまったく同じ単語のときだけ exactHits が印を付ける)
  const isAscii = (run: { start: number; end: number }): boolean =>
    chars.slice(run.start, run.end).every((char) => /^[\x20-\x7e]$/.test(char));
  const kept = runs.filter(
    (run) => run.end - run.start >= MIN_RUN && !isAscii(run),
  );
  return chars.map((_char, index) =>
    kept.some((run) => run.start <= index && index < run.end),
  );
};

const segmentsOf = (
  chars: readonly string[],
  hits: readonly boolean[],
): SnippetSegment[] => {
  const breaks = hits.flatMap((hit, index) =>
    index === 0 || hit !== hits[index - 1] ? [index] : [],
  );
  return breaks.map((start, index) => ({
    text: chars.slice(start, breaks[index + 1] ?? chars.length).join(""),
    hit: hits[start] ?? false,
  }));
};

export const snippetOf = (text: string, query: string): SnippetSegment[] => {
  const chars = [...flatten(text)];
  const exact = exactHits(chars, termsOf(query));
  const hits = exact.some(Boolean) ? exact : runHits(chars, query);
  const first = Math.max(0, hits.indexOf(true));
  const start = Math.max(0, first - LEAD);
  const end = Math.min(chars.length, start + WIDTH);
  const body = segmentsOf(chars.slice(start, end), hits.slice(start, end));
  return [
    ...(start > 0 ? [{ text: "…", hit: false }] : []),
    ...body,
    ...(end < chars.length ? [{ text: "…", hit: false }] : []),
  ];
};

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
