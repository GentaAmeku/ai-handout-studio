// サイト内検索の語の合わせ方。
// 大文字と小文字、全角と半角は区別しない。空白で区切った語は全部を含むものだけが当たる

// NFKC でそろえてから小文字にする(`ＡＩ` と `AI`、全角の空白と半角の空白が同じになる)
export const normalize = (text: string): string =>
  text.normalize("NFKC").toLocaleLowerCase("ja");

// 打った語を、空白で区切った語の並びにする。空なら何も探さない
export const termsOf = (query: string): string[] =>
  normalize(query).split(/\s+/).filter(Boolean);

// 見るところのどれかに、語が1つずつ全部入っているか
export const matchesAll = (
  terms: readonly string[],
  fields: readonly string[],
): boolean => {
  if (terms.length === 0) return false;
  const haystack = normalize(fields.join("\n"));
  return terms.every((term) => haystack.includes(term));
};

export type Segment = { text: string; hit: boolean };

// 語に当たった所を印にする。1字ずつそろえて、元の字の位置へ戻す
// (NFKC で字数が変わる字があっても、元の字のまま返す)
export const highlight = (
  text: string,
  terms: readonly string[],
): Segment[] => {
  const chars = [...text];
  const pieces = chars.map((char) => normalize(char));
  // 題名は短いので、字ごとに頭からの長さを数え直す
  const starts = pieces.map(
    (_piece, index) => pieces.slice(0, index).join("").length,
  );
  const joined = pieces.join("");
  const ranges = terms.flatMap((term) =>
    [...joined.matchAll(new RegExp(escapeRegExp(term), "g"))].map(
      (match) => [match.index, match.index + term.length] as const,
    ),
  );
  const hits = chars.map((_char, index) => {
    const start = starts[index] ?? 0;
    const end = start + (pieces[index]?.length ?? 0);
    return ranges.some(([from, to]) => start < to && end > from);
  });
  // 印の有無が変わる所で切る
  const breaks = hits.flatMap((hit, index) =>
    index === 0 || hit !== hits[index - 1] ? [index] : [],
  );
  return breaks.map((start, index) => ({
    text: chars.slice(start, breaks[index + 1] ?? chars.length).join(""),
    hit: hits[start] ?? false,
  }));
};

const escapeRegExp = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
