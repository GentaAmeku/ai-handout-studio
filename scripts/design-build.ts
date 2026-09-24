import { fileURLToPath } from "node:url";
import { ensureTemplateRegistry } from "../app/server/design-registry.ts";
import { markDesignBuilt } from "./dev-sync.mjs";

// pnpm design:build。design/ の JSON から dist の CSS と見本を作り直す
const designDir = fileURLToPath(new URL("../design", import.meta.url));
// 見本の生成器は dist/templates.json を import するので、置いてから読み込む
await ensureTemplateRegistry(designDir);
const { buildDesign } = await import("../app/server/design-build.ts");
const result = await buildDesign(designDir);
if (result.success) {
  // 開発サーバーを起こすときに作り直さずに済むよう、作った元の指紋を残す
  markDesignBuilt();
  console.log(result.files.map((file) => `作った: design/${file}`).join("\n"));
} else {
  console.error(result.message);
  process.exitCode = 1;
}
