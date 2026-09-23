import { escapeHtml } from "./sheet-render.ts";

// テンプレートの見本(design/samples/)の組織名。見本はこの仮の名前で作り、
// 配信するときに設定の組織名へ差し替える。設定が空なら組織名を外す
export const SAMPLE_ORG_NAME = "組織名";

const OPEN = '<div class="ds-signature">';
const SPAN = `<span>${SAMPLE_ORG_NAME}</span>`;

export const sampleWithOrgName = (html: string, orgName?: string): string =>
  orgName
    ? html.replaceAll(
        `${OPEN}${SPAN}`,
        `${OPEN}<span>${escapeHtml(orgName)}</span>`,
      )
    : html
        .replaceAll(`${OPEN}${SPAN}</div>`, "")
        .replaceAll(`${OPEN}${SPAN}`, OPEN);
