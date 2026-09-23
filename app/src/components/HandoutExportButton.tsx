import { Copy, Download, FolderOpen, X } from "lucide-react";
import { useState } from "react";
import { useExportHandout } from "../api/queries";
import type { HandoutKind } from "../api/types";
import { useLanguage } from "../i18n/language";
import { type CopyOutcome, copyToClipboard } from "./copy-text";

// HTML 資料の編集画面と質問票の1件のページの帯に置く「1枚の HTML に書き出す」(132 でアイコンだけにした)。
// 帯の下の知らせにパスを出し、「パスをコピー」と「フォルダを開くコマンドをコピー」を並べる(133。
// 前はパスを出すだけで、ファイルを探すのに困った)。コマンドはサーバーが自分の OS に合わせて作る

type Copied = {
  readonly what: "path" | "command";
  readonly outcome: CopyOutcome;
};

// 帯の道具のボタンはどれも枠の無いアイコン(button--ghost)。塗りの色は、その画面でいちばん大事な
// 操作1つ(HTML 資料の保存)だけに使う
export const HandoutExportButton = ({
  kind,
  id,
  disabledReason,
}: {
  kind: HandoutKind;
  id: string;
  disabledReason?: string;
}) => {
  const { t } = useLanguage();
  const exportHandout = useExportHandout(kind, id);
  const [copied, setCopied] = useState<Copied | null>(null);
  const result = exportHandout.data;

  const run = () => {
    setCopied(null);
    exportHandout.mutate();
  };

  const copy = async (what: Copied["what"], text: string) => {
    setCopied({ what, outcome: await copyToClipboard(text) });
  };

  const close = () => {
    setCopied(null);
    exportHandout.reset();
  };

  // 押したボタンだけ「コピーしました」に替える
  const labelOf = (what: Copied["what"], idle: string): string =>
    copied?.what === what && copied.outcome !== "manual"
      ? t("handouts.pathCopied")
      : idle;

  return (
    <>
      <button
        type="button"
        className="button button--ghost button--icon"
        aria-label={
          exportHandout.isPending
            ? t("handouts.exporting")
            : t("handouts.export")
        }
        title={disabledReason ?? t("handouts.export")}
        disabled={exportHandout.isPending || disabledReason !== undefined}
        onClick={run}
      >
        <Download size={18} aria-hidden />
      </button>
      {/* 結果は帯の中に書かず、帯の下に浮かぶ知らせに出す */}
      <div
        className="export-notice"
        role="status"
        aria-live="polite"
        hidden={!exportHandout.isError && !exportHandout.isSuccess}
      >
        {exportHandout.isError && (
          <p className="export-notice__title export-notice__title--error">
            {exportHandout.error.message}
          </p>
        )}
        {result && (
          <>
            <p className="export-notice__title">{t("handouts.exported")}</p>
            <code className="export-notice__path">{result.path}</code>
            <div className="export-notice__actions">
              <button
                type="button"
                className="button button--secondary"
                onClick={() => void copy("path", result.path)}
              >
                <Copy size={16} aria-hidden />
                {labelOf("path", t("handouts.copyPath"))}
              </button>
              <button
                type="button"
                className="button button--secondary"
                title={result.openCommand}
                onClick={() => void copy("command", result.openCommand)}
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
                  <code className="export-notice__path">
                    {result.openCommand}
                  </code>
                )}
              </>
            )}
          </>
        )}
        <button
          type="button"
          className="icon-button export-notice__close"
          aria-label={t("export.closeNotice")}
          onClick={close}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </>
  );
};
