import { Copy, FolderOpen } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../i18n/language";
import { type CopyOutcome, copyToClipboard } from "./copy-text";

// 書き出しの知らせに出す、書き出し先のパスと「パスをコピー」「フォルダを開くコマンドをコピー」。
// HTML 資料・質問票(HandoutExportButton)とスライド(ExportControls)が同じものを使う。
// 書き出し直すと知らせの中身が作り直されるので、「コピーしました」は次の書き出しに持ち越さない

type Copied = {
  readonly what: "path" | "command";
  readonly outcome: CopyOutcome;
};

export const ExportLocation = ({
  path,
  openCommand,
}: {
  path: string;
  openCommand: string;
}) => {
  const { t } = useLanguage();
  const [copied, setCopied] = useState<Copied | null>(null);

  const copy = async (what: Copied["what"], text: string) => {
    setCopied({ what, outcome: await copyToClipboard(text) });
  };

  // 押したボタンだけ「コピーしました」に替える
  const labelOf = (what: Copied["what"], idle: string): string =>
    copied?.what === what && copied.outcome !== "manual"
      ? t("handouts.pathCopied")
      : idle;

  return (
    <>
      <code className="export-notice__path">{path}</code>
      <div className="export-notice__actions">
        <button
          type="button"
          className="button button--secondary"
          onClick={() => void copy("path", path)}
        >
          <Copy size={16} aria-hidden />
          {labelOf("path", t("handouts.copyPath"))}
        </button>
        <button
          type="button"
          className="button button--secondary"
          title={openCommand}
          onClick={() => void copy("command", openCommand)}
        >
          <FolderOpen size={16} aria-hidden />
          {labelOf("command", t("handouts.copyOpenCommand"))}
        </button>
      </div>
      {copied?.outcome === "manual" && (
        <>
          <p className="export-notice__warnings">
            {t("handouts.pathCopyFailed")}
          </p>
          {copied.what === "command" && (
            <code className="export-notice__path">{openCommand}</code>
          )}
        </>
      )}
    </>
  );
};
