// 表をプロパティ欄で直すための文字列との変換。セルは「|」で区切る

const SEPARATOR = "|";

const splitCells = (line: string): string[] =>
  line.split(SEPARATOR).map((cell) => cell.trim());

export const headersToText = (headers: readonly string[]): string =>
  headers.join(` ${SEPARATOR} `);

export const rowsToText = (rows: readonly (readonly string[])[]): string =>
  rows.map((row) => row.join(` ${SEPARATOR} `)).join("\n");

// 列の見出しは1つ以上。各行は見出しと同じ列数に足すか切る(スキーマの条件)
export const textToTable = (
  headersText: string,
  rowsText: string,
): { headers: string[]; rows: string[][] } => {
  const parsed = splitCells(headersText).filter((cell) => cell !== "");
  const headers = parsed.length > 0 ? parsed : ["項目"];
  const rows = rowsText
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => {
      const cells = splitCells(line);
      return headers.map((_, index) => cells[index] ?? "");
    });
  return { headers, rows };
};
