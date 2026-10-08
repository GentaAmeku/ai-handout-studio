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

// 中身の当たりの並べ方(docs/plans/content-search.md §4)。
// 1. 打った語(空白で区切った語)を全部含む資料を先に出す。判定は題名の検索と同じ matchesAll
// 2. 残りは資料全体の点(2文字の重なりの BM25)の順。最上位の点の4割に届かないものは出さない
// 3. 合わせて10件まで。2行目は、その資料の中で点がいちばん高い区切り

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

export type RankOptions = {
  // 題名で当たった資料を外すか。窓は外し(題名の区分に出ている)、コマンドは外さない
  excludeTitleHits: boolean;
  limit?: number;
};

const LIMIT = 10;
const FLOOR = 0.4;

const keyOf = (source: { kind: ContentKind; id: string }): string =>
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

export const rankContent = (
  sources: readonly IndexedSource[],
  query: string,
  { excludeTitleHits, limit = LIMIT }: RankOptions,
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
  if (top === 0) return [];
  const candidates = sources.filter(
    (source) =>
      !(excludeTitleHits && matchesAll(terms, source.titleFields)) &&
      scoreOf(source) > 0,
  );
  const containsAll = (source: IndexedSource): boolean =>
    matchesAll(terms, [source.title, ...source.chunks.map((c) => c.text)]);
  const byScore = (a: IndexedSource, b: IndexedSource) =>
    scoreOf(b) - scoreOf(a);
  const picked = [
    ...candidates.filter(containsAll).sort(byScore),
    ...candidates
      .filter(
        (source) => !containsAll(source) && scoreOf(source) >= top * FLOOR,
      )
      .sort(byScore),
  ].slice(0, limit);
  if (picked.length === 0) return [];
  const chunkScores = bm25(chunkCorpus(sources), grams);
  return picked.flatMap((source) => {
    const chunk = bestChunk(source, chunkScores, terms);
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
