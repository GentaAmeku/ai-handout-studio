import { ExternalLink, Share2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useShareHandout } from "../api/queries";
import type { HandoutKind, ShareApiResult } from "../api/types";
import { useLanguage } from "../i18n/language";
import { type CopyOutcome, copyToClipboard } from "./copy-text";

// 質問票の1件のページと HTML 資料の編集画面の帯に置く「共有の依頼をコピー」。
// 押すと束を作り直し、依頼文をコピーする。コピーは3段(123 と同じ):
// clipboard → execCommand → 手で写す欄。知らせは押したボタンのそばの吹き出しで(124 と同じ反転の地と
// しっぽ。帯は画面のいちばん上にあるので下向きに開く)、コピーできたときは3秒で消す。
// 警告・手で写す欄・失敗の理由は吹き出しの下の札に出し、閉じるか次に押すまで残す

const TIP_MS = 3000;

type Notes = {
  readonly warning?: string;
  readonly manualText?: string;
  readonly error?: string;
};

const requestShare = (
  mutateAsync: () => Promise<ShareApiResult>,
): Promise<{ result: ShareApiResult } | { error: string }> =>
  mutateAsync().then(
    (result) => ({ result }),
    (error: unknown) => ({
      error: error instanceof Error ? error.message : String(error),
    }),
  );

const notesOf = (result: ShareApiResult, copied: CopyOutcome): Notes | null => {
  const notes: Notes = {
    ...(result.warning ? { warning: result.warning } : {}),
    ...(copied === "manual" ? { manualText: result.prompt } : {}),
  };
  return Object.keys(notes).length > 0 ? notes : null;
};

export const ShareButton = ({
  kind,
  id,
  sharedUrl,
  disabledReason,
}: {
  kind: HandoutKind;
  id: string;
  // 前に公開した URL(share.json)。無ければ null
  sharedUrl: string | null;
  disabledReason?: string;
}) => {
  const { t } = useLanguage();
  const share = useShareHandout(kind, id);
  const [outcome, setOutcome] = useState<CopyOutcome | null>(null);
  const [notes, setNotes] = useState<Notes | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const fallbackRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // 手で写す欄は、出たときに選んだ状態にしておく(123 と同じ)
  useEffect(() => {
    if (notes?.manualText) fallbackRef.current?.select();
  }, [notes]);

  const run = async () => {
    clearTimeout(timerRef.current);
    setOutcome(null);
    setNotes(null);
    const response = await requestShare(() => share.mutateAsync());
    if ("error" in response) {
      setNotes({ error: response.error });
      return;
    }
    const copied = await copyToClipboard(response.result.prompt);
    setOutcome(copied);
    setNotes(notesOf(response.result, copied));
    // コピーできなかったときは、案内も欄と一緒に閉じるまで残す
    if (copied === "manual") return;
    timerRef.current = setTimeout(() => setOutcome(null), TIP_MS);
  };

  return (
    <div className="share-button">
      <div className="share-button__anchor">
        {/* アイコンだけ。名前は読み上げと吹き出し(data-tooltip)に持たせる */}
        <button
          type="button"
          className="button button--ghost button--icon"
          aria-label={
            share.isPending ? t("handouts.sharing") : t("handouts.share")
          }
          data-tooltip={disabledReason ?? t("handouts.share")}
          disabled={share.isPending || disabledReason !== undefined}
          onClick={() => void run()}
        >
          <Share2 size={18} aria-hidden />
        </button>

        {(outcome || notes) && (
          <div className="share-button__pop">
            {outcome && (
              <p className="share-button__tip" role="status" aria-live="polite">
                {t(
                  outcome === "manual"
                    ? "handouts.shareCopyFailed"
                    : "handouts.shareCopied",
                )}
              </p>
            )}
            {notes && (
              <div className="share-button__notes">
                {notes.error && (
                  <p className="share-button__error" role="alert">
                    {notes.error}
                  </p>
                )}
                {notes.warning && (
                  <p className="share-button__warning">{notes.warning}</p>
                )}
                {notes.manualText && (
                  <textarea
                    ref={fallbackRef}
                    className="share-button__fallback"
                    aria-label={t("handouts.shareFallback")}
                    readOnly
                    value={notes.manualText}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                )}
                <button
                  type="button"
                  className="icon-button share-button__close"
                  aria-label={t("export.closeNotice")}
                  onClick={() => {
                    clearTimeout(timerRef.current);
                    setOutcome(null);
                    setNotes(null);
                  }}
                >
                  <X size={16} aria-hidden />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {sharedUrl && (
        <a
          className="share-button__shared"
          href={sharedUrl}
          title={sharedUrl}
          target="_blank"
          rel="noreferrer"
        >
          {/* URL の文字は帯に出さない。帯が折り返して題名を押した */}
          {t("handouts.shared")}
          <ExternalLink size={14} aria-hidden />
        </a>
      )}
    </div>
  );
};
