// 文字の幅を、ブラウザに頼らず見積もる。同じ入力からは、どの PC でも同じ配置になるようにするため。
// 全角は 1 字幅、半角は字種ごとの平均。実際の描画より少し広めに見積もり、はみ出しを防ぐ。

const WIDE = /[ᄀ-ᅟ⺀-〿぀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u;
const NARROW = /[il.,:;'|!()[\]]/;

export const charWidth = (ch) => {
  if (WIDE.test(ch)) return 1;
  if (ch === " ") return 0.32;
  if (/[A-Z]/.test(ch)) return 0.7;
  if (NARROW.test(ch)) return 0.34;
  return 0.6;
};

// 図の中に生成器が書く言葉(凡例など)の言語。題か説明に日本語があれば日本語、無ければ英語
export const langOf = ({ title, caption }) => (/[\u3040-\u30ff\u3400-\u9fff]/u.test(`${title}${caption}`) ? "ja" : "en");

export const textWidth = (text, fontPx) => [...text].reduce((sum, ch) => sum + charWidth(ch), 0) * fontPx;

// 英数字の並びは途中で割らない。日本語は助詞・句読点の後ろでだけ割る(文節に近い単位)。
// 「調べ/る」のような語の途中の改行を避けるため。1つの単位が1行に入らないときだけ、字で割る。
const BREAK_AFTER = /[をがのにでとはもへや、。・）」]/u;
function tokenize(text) {
  const raw = text.match(/[A-Za-z0-9@._\-/#:+]+|\s+|./gu) ?? [];
  const tokens = [];
  let current = "";
  for (const piece of raw) {
    current += piece;
    if (BREAK_AFTER.test(piece) || /^\s+$/.test(piece)) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens;
}
// 行頭に来てはいけない字(句読点・閉じかっこ・小書きの仮名・長音)
const NO_LINE_START = /^[、。，．・：；？！ー）」』】〕〉》’”ぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]/u;

export function wrap(text, fontPx, maxWidth) {
  return text.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, fontPx, maxWidth));
}

function wrapParagraph(text, fontPx, maxWidth) {
  const lines = [];
  let line = "";
  for (const token of tokenize(text)) {
    const candidate = line + token;
    const fits = textWidth(candidate.trimEnd(), fontPx) <= maxWidth;
    if (fits || line === "" || NO_LINE_START.test(token)) {
      line = candidate;
      continue;
    }
    lines.push(line.trimEnd());
    line = token.trimStart();
  }
  if (line.trim() !== "") lines.push(line.trimEnd());
  return lines.flatMap((l) => splitOverlong(l, fontPx, maxWidth));
}

// 1単位で幅を超える行は、字の単位で割る。行頭に来てはいけない字は、前の行の末尾にぶら下げる
function splitOverlong(line, fontPx, maxWidth) {
  if (textWidth(line, fontPx) <= maxWidth) return [line];
  const out = [];
  let current = "";
  for (const ch of line) {
    if (current !== "" && textWidth(current + ch, fontPx) > maxWidth && !NO_LINE_START.test(ch)) {
      out.push(current);
      current = "";
    }
    current += ch;
  }
  if (current) out.push(current);
  return out;
}
