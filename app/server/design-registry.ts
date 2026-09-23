import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

// 見本の生成器は画面の描画(SlideView)を読み、SlideView は design/dist/templates.json を import する。
// dist が無い初回(段 I の後・dist を消した後)でも build を起こせるよう、無ければ空の JSON を置く。
// 空の JSON は形の違うファイルとして読み飛ばされ、build が作り直す
export const ensureTemplateRegistry = async (designDir: string) => {
  await mkdir(join(designDir, "dist"), { recursive: true });
  await writeFile(join(designDir, "dist", "templates.json"), "{}\n", {
    flag: "wx",
  }).catch(() => undefined);
};
