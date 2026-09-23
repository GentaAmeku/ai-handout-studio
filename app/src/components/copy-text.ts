// 文字をクリップボードに入れる。3段(123 と同じ): clipboard → execCommand → 手で写す。
// 「共有の依頼をコピー」と書き出しの「パスをコピー」が使う

export type CopyOutcome = "clipboard" | "execCommand" | "manual";

const copyWithClipboard = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const copyWithExecCommand = (text: string): boolean => {
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "-1000px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

export const copyToClipboard = async (text: string): Promise<CopyOutcome> => {
  if (await copyWithClipboard(text)) return "clipboard";
  if (copyWithExecCommand(text)) return "execCommand";
  return "manual";
};
