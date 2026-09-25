import { Download, X } from "lucide-react";
import { useExportHandout } from "../api/queries";
import type { HandoutKind } from "../api/types";
import { useLanguage } from "../i18n/language";
import { ExportLocation } from "./ExportLocation";

// HTML 資料の編集画面と質問票の1件のページの帯に置く「1枚の HTML に書き出す」(132 でアイコンだけにした)。
// 帯の下の知らせにパスを出し、「パスをコピー」と「フォルダを開くコマンドをコピー」を並べる(133。
// 前はパスを出すだけで、ファイルを探すのに困った)。コマンドはサーバーが自分の OS に合わせて作る

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
  const result = exportHandout.data;

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
        data-tooltip={disabledReason ?? t("handouts.export")}
        disabled={exportHandout.isPending || disabledReason !== undefined}
        onClick={() => exportHandout.mutate()}
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
            <ExportLocation
              path={result.path}
              openCommand={result.openCommand}
            />
          </>
        )}
        <button
          type="button"
          className="icon-button export-notice__close"
          aria-label={t("export.closeNotice")}
          onClick={() => exportHandout.reset()}
        >
          <X size={16} aria-hidden />
        </button>
      </div>
    </>
  );
};
