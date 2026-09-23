import { fileURLToPath } from "node:url";
import { ensureTemplateRegistry } from "../app/server/design-registry.ts";

// pnpm design:build。design/ の JSON から dist の CSS と見本を作り直す
const designDir = fileURLToPath(new URL("../design", import.meta.url));
// 見本の生成器は dist/templates.json を import するので、置いてから読み込む
await ensureTemplateRegistry(designDir);
const { buildDesign } = await import("../app/server/design-build.ts");
const result = await buildDesign(designDir);
if (result.success) {
  console.log(result.files.map((file) => `作った: design/${file}`).join("\n"));
} else {
  console.error(result.message);
  process.exitCode = 1;
}
