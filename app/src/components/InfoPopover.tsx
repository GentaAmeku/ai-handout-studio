import { Info } from "lucide-react";
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

// 編集画面の上の帯に足す ⓘ。押すと小さな欄が開き、ID・作成日時などの
// 行(rows)を出す。外を押すか Esc で閉じる
export type InfoRow = { label: string; value: ReactNode };

export const InfoPopover = ({
  label,
  rows,
}: {
  label: string;
  rows: readonly InfoRow[];
}) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="info-popover" ref={rootRef}>
      <button
        type="button"
        // 帯のほかの道具のボタンと同じ、枠の無いアイコン
        className="button button--ghost button--icon"
        aria-label={label}
        data-tooltip={label}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
      >
        <Info size={18} aria-hidden />
      </button>
      {open && (
        <dl id={panelId} className="info-popover__panel" aria-label={label}>
          {rows.map((row) => (
            <div key={row.label} className="info-popover__row">
              <dt>{row.label}</dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};
