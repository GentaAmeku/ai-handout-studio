import type { Locale } from "../src/schema/profile.ts";
import { escapeHtml } from "./sheet-render.ts";

// テンプレートの見本(design/samples/)の組織名。見本はこの仮の名前で作り、
// 配信するときに設定の組織名へ差し替える。設定が空なら組織名を外す
export const SAMPLE_ORG_NAMES: Record<Locale, string> = {
  ja: "組織名",
  en: "Organization",
};

const OPEN = '<div class="ds-signature">';

export const sampleWithOrgName = (html: string, orgName?: string): string =>
  Object.values(SAMPLE_ORG_NAMES)
    .map((name) => `<span>${name}</span>`)
    .reduce(
      (text, span) =>
        orgName
          ? text.replaceAll(
              `${OPEN}${span}`,
              `${OPEN}<span>${escapeHtml(orgName)}</span>`,
            )
          : text
              .replaceAll(`${OPEN}${span}</div>`, "")
              .replaceAll(`${OPEN}${span}`, OPEN),
      html,
    );
