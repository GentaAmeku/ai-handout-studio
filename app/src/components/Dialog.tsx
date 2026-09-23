import { X } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { useLanguage } from "../i18n/language";

// showModal で開き、Esc などの閉じる操作はブラウザに任せる。
// 入力途中で消えないよう、外側クリックでは閉じない
export const Dialog = ({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) => {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const { t } = useLanguage();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      onClose={onClose}
    >
      <div className="dialog__header">
        <h2 id={titleId} className="dialog__title">
          {title}
        </h2>
        <button
          type="button"
          className="icon-button"
          aria-label={t("dialog.close")}
          onClick={onClose}
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      {open && children}
    </dialog>
  );
};
