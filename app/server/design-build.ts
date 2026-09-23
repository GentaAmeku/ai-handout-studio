import { buildDesignCss, writeOutputs } from "./design.ts";
import { buildFontAssets } from "./design-fonts.ts";
import { migrateToTemplates } from "./design-migrate.ts";
import { pruneSampleAssets, sampleOutputs } from "./design-samples.ts";

// dist の CSS と samples/ の見本を作り直す
export const buildDesign = async (designDir: string) => {
  // 段 I より前のテーマと型を、テンプレートへ移してから作る
  const migrated = await migrateToTemplates(designDir);
  if ("error" in migrated)
    return { success: false as const, message: migrated.error };
  const css = await buildDesignCss(designDir);
  if (!css.success) return css;
  // 見本と読む画面が self で読む書体。同梱の fontsource から dist/fonts へ写す
  const fonts = await buildFontAssets(designDir);
  const outputs = await sampleOutputs(designDir);
  await pruneSampleAssets(designDir, outputs);
  const samples = await writeOutputs(designDir, outputs);
  return {
    success: true as const,
    files: [...css.files, ...fonts, ...samples],
  };
};
