import { useRef } from "react";
import { useLanguage } from "../../i18n/language";

const KEY_STEP = 16;

// サイドバーの幅を変えるつまみ。ドラッグと左右キーで動かす
export const SideResizeHandle = ({
  width,
  min,
  max,
  onChange,
}: {
  width: number;
  min: number;
  max: number;
  onChange: (width: number) => void;
}) => {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const { t } = useLanguage();

  const clamp = (value: number): number =>
    Math.min(max, Math.max(min, Math.round(value)));

  return (
    <div
      role="slider"
      aria-label={t("side.width")}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={width}
      aria-orientation="vertical"
      tabIndex={0}
      className="side-resize-handle"
      onPointerDown={(event) => {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // キャプチャは取れなくてもドラッグは続ける
        }
        drag.current = { startX: event.clientX, startWidth: width };
      }}
      onPointerMove={(event) => {
        const current = drag.current;
        if (!current) return;
        if (event.buttons === 0) {
          // ボタンなしの移動はホバー。up を取りこぼした残骸を消す
          drag.current = null;
          return;
        }
        // 境目を掴んで動かす向き。左へ引くと広がり、右へ押すと狭まる
        onChange(clamp(current.startWidth - event.clientX + current.startX));
      }}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onChange(clamp(width + KEY_STEP));
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          onChange(clamp(width - KEY_STEP));
        }
      }}
    />
  );
};
