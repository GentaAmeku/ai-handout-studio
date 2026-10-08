import { normalize } from "../../src/search/match.ts";

// 2文字ずつ重ねて切った片(「資料一覧」→「資料」「料一」「一覧」)の重なりで点を付ける(BM25)。
// どこにでも出る片は軽く、珍しい片ほど重い。長い文が得をしすぎないよう長さでならす。
// 日本語は語の切れ目が無いので、辞書を持たずに言い回しの近さを拾える(比べた結果は docs/plans/content-search.md §2)

export type GramCounts = ReadonlyMap<string, number>;

// 全角と半角・大文字と小文字をそろえ、空白を除いてから切る。1字なら片は無い
export const bigramsOf = (text: string): string[] => {
  const chars = [...normalize(text).replace(/\s+/g, "")];
  return chars.slice(1).map((char, index) => `${chars[index]}${char}`);
};

export const countGrams = (text: string): Map<string, number> =>
  bigramsOf(text).reduce<Map<string, number>>(
    (counts, gram) => counts.set(gram, (counts.get(gram) ?? 0) + 1),
    new Map(),
  );

export const addCounts = (all: readonly GramCounts[]): Map<string, number> =>
  all.reduce<Map<string, number>>((sum, counts) => {
    counts.forEach((count, gram) => {
      sum.set(gram, (sum.get(gram) ?? 0) + count);
    });
    return sum;
  }, new Map());

export type Corpus<K> = {
  docs: readonly { key: K; counts: GramCounts; length: number }[];
  // 片ごとの、その片を含む文書の数
  df: ReadonlyMap<string, number>;
  averageLength: number;
};

export const corpusOf = <K>(
  entries: readonly { key: K; counts: GramCounts }[],
): Corpus<K> => {
  const docs = entries.map((entry) => ({
    ...entry,
    length: [...entry.counts.values()].reduce((sum, count) => sum + count, 0),
  }));
  const df = docs.reduce((seen, doc) => {
    doc.counts.forEach((_count, gram) => {
      seen.set(gram, (seen.get(gram) ?? 0) + 1);
    });
    return seen;
  }, new Map<string, number>());
  const total = docs.reduce((sum, doc) => sum + doc.length, 0);
  return {
    docs,
    df,
    averageLength: docs.length === 0 ? 0 : total / docs.length,
  };
};

const K1 = 1.2;
const B = 0.75;

// 打った文の片(重なりは1回に数える)に対する、文書ごとの点。片が1つも無い文書は 0
export const bm25 = <K>(
  corpus: Corpus<K>,
  queryGrams: readonly string[],
): Map<K, number> => {
  const grams = [...new Set(queryGrams)];
  const size = corpus.docs.length;
  return new Map(
    corpus.docs.map((doc) => {
      const norm = 1 - B + (B * doc.length) / (corpus.averageLength || 1);
      const score = grams.reduce((sum, gram) => {
        const tf = doc.counts.get(gram) ?? 0;
        if (tf === 0) return sum;
        const df = corpus.df.get(gram) ?? 0;
        const idf = Math.log(1 + (size - df + 0.5) / (df + 0.5));
        return sum + (idf * tf * (K1 + 1)) / (tf + K1 * norm);
      }, 0);
      return [doc.key, score] as const;
    }),
  );
};
