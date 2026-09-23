import { z } from "zod";

// 公開した先の控え(share.json)。束(share/)の外、資料のフォルダの直下に置く。
// 束を作り直しても消えない。いまは Claude の Artifact だけ

export const SHARE_URL_PREFIX = "https://claude.ai/";

// https://claude.ai/ で始まり、URL として読めて、空白や引用符を含まないもの。
// 依頼文にそのまま写すので、`https://claude.ai/ x` や改行入りは受けない
export const isShareUrl = (value: string): boolean => {
  if (!value.startsWith(SHARE_URL_PREFIX)) return false;
  if (/[\s"'`<>]/.test(value)) return false;
  return URL.canParse(value) && new URL(value).host === "claude.ai";
};

export const shareStateSchema = z.strictObject({
  target: z.literal("claude-artifact"),
  url: z.string().refine(isShareUrl, `URL は ${SHARE_URL_PREFIX} で始まる`),
  sharedAt: z.iso.datetime(),
});

export type ShareState = z.infer<typeof shareStateSchema>;
