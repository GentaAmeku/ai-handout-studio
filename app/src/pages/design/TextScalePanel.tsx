import type { CSSProperties } from "react";
import { useLanguage } from "../../i18n/language";
import { TEXT_SCALE } from "../../schema/design";

// テンプレートの編集の「文字の大きさ」。見出し・本文・注記の字をそろえて大きく・小さくする倍率。
// 節の中身だけを返す(見出しは呼び出し側の Section が出す)。値は小数(1 = 100%)で受け渡す

const percent = (scale: number): number => Math.round(scale * 100);

const MAX = percent(TEXT_SCALE.max);
const STEP = percent(TEXT_SCALE.step);

export const TextScalePanel = ({
  value,
  min,
  minFontSize,
  onChange,
}: {
  value: number;
  // 下限の倍率。検査の最小の字を割らないところ(theme.ts の minTextScale)
  min: number;
  minFontSize?: number;
  onChange: (scale: number) => void;
}) => {
  const { t } = useLanguage();
  // 下限より小さい値がファイルに書かれていても、動かすまでは今の値を出す
  const low = Math.min(percent(min), percent(value));
  const current = percent(value);
  // 目盛りは下限・100%・上限(下限が 100% なら2つ)
  const ticks = [low, ...(low < 100 ? [100] : []), MAX].map((tick) => ({
    tick,
    position: ((tick - low) / (MAX - low)) * 100,
  }));
  return (
    <>
      <div className="text-scale__head">
        {/* 読み上げはスライダーの aria-valuetext が受け持つ */}
        <span className="text-scale__value" aria-hidden>
          {t("design.textScale.value", { n: current })}
        </span>
        <button
          type="button"
          className="text-scale__reset"
          disabled={current === 100}
          onClick={() => onChange(1)}
        >
          {t("design.textScale.reset")}
        </button>
      </div>
      <input
        className="text-scale__range"
        type="range"
        min={low}
        max={MAX}
        step={STEP}
        value={current}
        aria-label={t("design.textScale.label")}
        aria-valuetext={t("design.textScale.value", { n: current })}
        onChange={(event) => onChange(Number(event.target.value) / 100)}
      />
      <div className="text-scale__ticks" aria-hidden>
        {ticks.map(({ tick, position }) => (
          <span
            key={tick}
            className="text-scale__tick"
            style={{ "--tick": `${position}%` } as CSSProperties}
          >
            {t("design.textScale.value", { n: tick })}
          </span>
        ))}
      </div>
      <p className="prop-field__hint">{t("design.textScale.hint")}</p>
      {minFontSize !== undefined && percent(min) > percent(TEXT_SCALE.min) && (
        <p className="prop-field__hint">
          {t("design.textScale.floor", {
            n: percent(min),
            px: minFontSize,
          })}
        </p>
      )}
    </>
  );
};
