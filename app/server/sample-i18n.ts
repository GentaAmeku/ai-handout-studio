// 見本(文書・質問票)の英語。構造は日本語の見本1つだけに持ち、文を表で英語へ置き換える。
// 表に無い文は日本語のまま残るので、テストが英語の見本に日本語が残らないことを確かめる

export type SampleText = ReadonlyMap<string, string>;

// 値の中の文字列を、表にあるものだけ置き換える。形(オブジェクト・配列)はそのまま
export const localizeSample = <T>(value: T, text: SampleText): T => {
  if (typeof value === "string") return (text.get(value) ?? value) as T;
  if (Array.isArray(value)) {
    return value.map((item) => localizeSample(item, text)) as T;
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        localizeSample(item, text),
      ]),
    ) as T;
  }
  return value;
};

// 未記入の印。英語の資料でも同じ印を使う
const PLACEHOLDER = "[[要確認]]";

// 値の中に残った日本語の文。英語の見本の検査に使う
export const japaneseStrings = (value: unknown): string[] => {
  if (typeof value === "string") {
    return /[　-ヿ一-鿿＀-￯]/.test(value.replaceAll(PLACEHOLDER, ""))
      ? [value]
      : [];
  }
  if (Array.isArray(value)) return value.flatMap(japaneseStrings);
  if (value !== null && typeof value === "object") {
    return Object.values(value).flatMap(japaneseStrings);
  }
  return [];
};
