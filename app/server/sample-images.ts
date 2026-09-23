import { readFileSync } from "node:fs";

// 見本(design/samples/)に載せる画像。design/samples/assets/ に同梱していて、見本の HTML には埋め込む
export const sampleImages = (
  names: readonly string[],
): ReadonlyMap<string, string> =>
  new Map(
    names.map((name) => [
      `assets/${name}`,
      `data:image/jpeg;base64,${readFileSync(new URL(`../../design/samples/assets/${name}`, import.meta.url)).toString("base64")}`,
    ]),
  );
