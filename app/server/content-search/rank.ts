import type { ContentHit, ContentKind } from "../../src/api/types.ts";
import { matchesAll, termsOf } from "../../src/search/match.ts";
import type { ContentChunk } from "./chunks.ts";
import {
  addCounts,
  bigramsOf,
  bm25,
  type Corpus,
  corpusOf,
  countGrams,
  type GramCounts,
} from "./score.ts";
import { snippetOf } from "./snippet.ts";

// 中身の当たりの並べ方(docs/plans/content-search.md §4・§5)。
// 1. 打った語(空白で区切った語)を全部含む資料を先に出す。判定は題名の検索と同じ matchesAll
// 2. 残りは資料全体の点(2文字の重なりの BM25)の順。最上位の点の4割に届かないものは出さない
//    ベクトル検索が使えるとき(180)は、重なりの順位とベクトルの近さの順位を RRF で足した順にし、4割の切りは使わない
// 3. 合わせて10件まで。2行目は、その資料の中で点がいちばん高い区切り(語を含まない資料はベクトルがいちばん近い区切り)

export type ContentSource = {
  kind: ContentKind;
  id: string;
  title: string;
  // 題名の検索が見るところ(題名・ID、スライドはタグも)。題名で当たった資料を中身の区分に重ねないために使う
  titleFields: readonly string[];
  chunks: readonly ContentChunk[];
};

// 資料ごとに一度だけ数えておく片(索引が持つ)
export type IndexedSource = ContentSource & {
  chunkCounts: readonly GramCounts[];
  counts: GramCounts;
};

export const indexSource = (source: ContentSource): IndexedSource => {
  const chunkCounts = source.chunks.map((chunk) => countGrams(chunk.text));
  return {
    ...source,
    chunkCounts,
    counts: addCounts([countGrams(source.title), ...chunkCounts]),
  };
};

// 資料ごとのベクトルの近さ(180)。鍵は「区分:id」、score はいちばん近い区切りの値、chunk はその区切りの番号
export type SemanticScores = ReadonlyMap<
  string,
  { score: number; chunk: number }
>;

export type RankOptions = {
  // 題名で当たった資料を外すか。窓は外し(題名の区分に出ている)、コマンドは外さない
  excludeTitleHits: boolean;
  limit?: number;
  semantic?: SemanticScores;
};

const LIMIT = 10;
const FLOOR = 0.4;
// RRF の定数。順位 r に 1/(RRF_K + r) を足す
const RRF_K = 60;

export const keyOf = (source: { kind: ContentKind; id: string }): string =>
  `${source.kind}:${source.id}`;

// その資料の中で、語を全部含む区切りを先に、次に点の高い区切りを選ぶ
const bestChunk = (
  source: IndexedSource,
  chunkScores: ReadonlyMap<string, number>,
  terms: readonly string[],
): ContentChunk | undefined => {
  const ranked = source.chunks
    .map((chunk, index) => ({
      chunk,
      all: matchesAll(terms, [chunk.text]),
      score: chunkScores.get(`${keyOf(source)}#${index}`) ?? 0,
    }))
    .sort((a, b) => Number(b.all) - Number(a.all) || b.score - a.score);
  return ranked[0]?.chunk;
};

// 2行目に出す文。札(節の見出し)と1行目(題名)に出ている字を頭から外す。外して空なら元のまま
export const displayText = (chunk: ContentChunk, title: string): string => {
  const lead = chunk.place.type === "section" ? chunk.place.heading : title;
  const rest = chunk.text.startsWith(lead)
    ? chunk.text.slice(lead.length).trim()
    : chunk.text;
  return rest === "" ? chunk.text : rest;
};

const chunkCorpus = (sources: readonly IndexedSource[]): Corpus<string> =>
  corpusOf(
    sources.flatMap((source) =>
      source.chunkCounts.map((counts, index) => ({
        key: `${keyOf(source)}#${index}`,
        counts,
      })),
    ),
  );

// 並びの中の順位(1 から)。同じ点は同じ順位にする(重なりが無い資料どうしに、並んでいた順で差を付けない)
const ranksOf = (
  sources: readonly IndexedSource[],
  score: (source: IndexedSource) => number,
): Map<IndexedSource, number> => {
  const sorted = sources.map(score).sort((a, b) => b - a);
  return new Map(
    sources.map((source) => {
      const value = score(source);
      return [source, 1 + sorted.filter((other) => other > value).length];
    }),
  );
};

export const rankContent = (
  sources: readonly IndexedSource[],
  query: string,
  { excludeTitleHits, limit = LIMIT, semantic }: RankOptions,
): ContentHit[] => {
  const grams = bigramsOf(query);
  const terms = termsOf(query);
  // 1字だけでは片が作れないので、中身は探さない(題名だけ)
  if (grams.length === 0 || terms.length === 0) return [];
  const scores = bm25(
    corpusOf(sources.map((source) => ({ key: source, counts: source.counts }))),
    grams,
  );
  const scoreOf = (source: IndexedSource): number => scores.get(source) ?? 0;
  const top = Math.max(0, ...sources.map(scoreOf));
  if (top === 0 && !semantic) return [];
  const notTitleHit = (source: IndexedSource): boolean =>
    !(excludeTitleHits && matchesAll(terms, source.titleFields));
  const containsAll = (source: IndexedSource): boolean =>
    matchesAll(terms, [source.title, ...source.chunks.map((c) => c.text)]);
  const picked = (
    semantic
      ? fusedOrder(sources, scoreOf, semantic, notTitleHit, containsAll)
      : lexicalOrder(sources, scoreOf, top, notTitleHit, containsAll)
  ).slice(0, limit);
  if (picked.length === 0) return [];
  const chunkScores = bm25(chunkCorpus(sources), grams);
  return picked.flatMap((source) => {
    const near = semantic?.get(keyOf(source));
    const chunk =
      near && !containsAll(source)
        ? (source.chunks[near.chunk] ?? bestChunk(source, chunkScores, terms))
        : bestChunk(source, chunkScores, terms);
    return chunk
      ? [
          {
            kind: source.kind,
            id: source.id,
            title: source.title,
            place: chunk.place,
            snippet: snippetOf(displayText(chunk, source.title), query),
          },
        ]
      : [];
  });
};

// 段1: 語を全部含む資料を点の順に、残りは最上位の点の4割以上を点の順に
const lexicalOrder = (
  sources: readonly IndexedSource[],
  scoreOf: (source: IndexedSource) => number,
  top: number,
  notTitleHit: (source: IndexedSource) => boolean,
  containsAll: (source: IndexedSource) => boolean,
): IndexedSource[] => {
  const candidates = sources.filter(
    (source) => notTitleHit(source) && scoreOf(source) > 0,
  );
  const byScore = (a: IndexedSource, b: IndexedSource) =>
    scoreOf(b) - scoreOf(a);
  return [
    ...candidates.filter(containsAll).sort(byScore),
    ...candidates
      .filter(
        (source) => !containsAll(source) && scoreOf(source) >= top * FLOOR,
      )
      .sort(byScore),
  ];
};

// 段2(180): 語を全部含む資料を先に、どちらも重なりの順位とベクトルの順位を RRF で足した順に
const fusedOrder = (
  sources: readonly IndexedSource[],
  scoreOf: (source: IndexedSource) => number,
  semantic: SemanticScores,
  notTitleHit: (source: IndexedSource) => boolean,
  containsAll: (source: IndexedSource) => boolean,
): IndexedSource[] => {
  const nearOf = (source: IndexedSource): number =>
    semantic.get(keyOf(source))?.score ?? Number.NEGATIVE_INFINITY;
  const lexical = ranksOf(sources, scoreOf);
  const vector = ranksOf(sources, nearOf);
  const fused = (source: IndexedSource): number =>
    1 / (RRF_K + (lexical.get(source) ?? sources.length)) +
    1 / (RRF_K + (vector.get(source) ?? sources.length));
  const byFused = (a: IndexedSource, b: IndexedSource) => fused(b) - fused(a);
  const candidates = sources.filter(notTitleHit);
  return [
    ...candidates.filter(containsAll).sort(byFused),
    ...candidates.filter((source) => !containsAll(source)).sort(byFused),
  ];
};
