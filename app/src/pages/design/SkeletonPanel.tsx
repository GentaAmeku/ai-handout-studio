import type { ReactNode } from "react";
import { LAYOUT_PRESETS } from "../../design/layout-presets";
import type { MessageKey } from "../../i18n/ja";
import { useLanguage } from "../../i18n/language";
import {
  type DocumentArea,
  type DocumentLayout,
  drawnSheetBase,
  type LayoutSurface,
  type SheetLayout,
} from "../../schema/design";
import { sameTemplate } from "./draft";

// テンプレートの編集の「レイアウト」。
// 質問票は1問ずつ・全問の2つと、1問ずつのときの一覧の位置。文書は用意した並び(layout-presets.ts)を縮図のカードから選ぶ

type Side = SheetLayout["list"]["side"];

// 質問票の画面で選べる骨格。overview は1問ずつと同じに描くので1問ずつが選ばれ、
// print はファイルでは読めるが、ここでは選ばない
const SHEET_CHOICES = ["focus", "all"] as const;
const SIDES = ["left", "right"] as const;

// 文書の縮図。列の幅の比で升目を並べ、本文・目次・脇を塗り分ける
const DocumentMini = ({ layout }: { layout: DocumentLayout }) => {
  const { t } = useLanguage();
  const named = (area: DocumentArea): string =>
    area === "." ? "" : t(`design.area.${area}` as MessageKey);
  // 升目を領域ごとに1つの箱にまとめる(スキーマが長方形を保証している)
  const boxes = [...new Set(layout.areas.flat())]
    .filter((area) => area !== ".")
    .map((area) => {
      const cells = layout.areas.flatMap((row, y) =>
        row.flatMap((name, x) => (name === area ? [{ x, y }] : [])),
      );
      const xs = cells.map((cell) => cell.x);
      const ys = cells.map((cell) => cell.y);
      return {
        area,
        column: `${Math.min(...xs) + 1} / ${Math.max(...xs) + 2}`,
        row: `${Math.min(...ys) + 1} / ${Math.max(...ys) + 2}`,
      };
    });
  return (
    <span
      className="skeleton-doc"
      aria-hidden
      style={{
        gridTemplateColumns: layout.columns
          .map((width) => `${width}fr`)
          .join(" "),
        gridTemplateRows: layout.areas
          .map((row) => (row.includes("main") ? "3fr" : "1fr"))
          .join(" "),
      }}
    >
      {boxes.map((box) => (
        <span
          key={box.area}
          className={`skeleton-doc__area skeleton-doc__area--${box.area}`}
          style={{ gridColumn: box.column, gridRow: box.row }}
        >
          {named(box.area)}
        </span>
      ))}
    </span>
  );
};

// 縮図のカード1枚。中の radio で選ぶ
const ChoiceCard = ({
  name,
  checked,
  label,
  onSelect,
  children,
}: {
  name: string;
  checked: boolean;
  label: string;
  onSelect: () => void;
  children: ReactNode;
}) => (
  <label className="skeleton-card">
    <input
      type="radio"
      className="visually-hidden"
      // 縮図の中の文字(本文・目次など)を名前に混ぜない
      aria-label={label}
      name={name}
      checked={checked}
      onChange={onSelect}
    />
    <span className="skeleton-card__figure">{children}</span>
    <span className="skeleton-card__label">{label}</span>
  </label>
);

const ChoiceGroup = ({
  legend,
  children,
}: {
  legend: string;
  children: ReactNode;
}) => (
  <fieldset className="skeleton-group">
    <legend className="design-subtitle">{legend}</legend>
    <div className="skeleton-cards">{children}</div>
  </fieldset>
);

// 文字だけの切り替え。中の radio で選ぶ
const Segments = <T extends string>({
  legend,
  showLegend = true,
  name,
  value,
  options,
  onSelect,
}: {
  legend: string;
  showLegend?: boolean;
  name: string;
  value: string;
  options: readonly { value: T; label: string }[];
  onSelect: (value: T) => void;
}) => (
  <fieldset className="skeleton-group">
    <legend className={showLegend ? "design-subtitle" : "visually-hidden"}>
      {legend}
    </legend>
    <div className="skeleton-segments">
      {options.map((option) => (
        <label key={option.value} className="skeleton-segment">
          <input
            type="radio"
            className="visually-hidden"
            name={name}
            checked={value === option.value}
            onChange={() => onSelect(option.value)}
          />
          {option.label}
        </label>
      ))}
    </div>
  </fieldset>
);

const SheetSkeleton = ({
  layout,
  onChange,
}: {
  layout: SheetLayout;
  onChange: (layout: SheetLayout) => void;
}) => {
  const { t } = useLanguage();
  const base = drawnSheetBase(layout.base);
  return (
    <>
      <Segments
        legend={t("design.skeleton.base")}
        showLegend={false}
        name="skeleton-base"
        value={base}
        options={SHEET_CHOICES.map((choice) => ({
          value: choice,
          label: t(`design.layout.${choice}`),
        }))}
        onSelect={(next) => onChange({ ...layout, base: next })}
      />
      {base === "focus" && (
        <Segments
          legend={t("design.skeleton.listSide")}
          name="skeleton-side"
          value={layout.list.side}
          options={SIDES.map((side: Side) => ({
            value: side,
            label: t(`design.skeleton.side.${side}`),
          }))}
          onSelect={(side) =>
            onChange({ ...layout, list: { ...layout.list, side } })
          }
        />
      )}
      {base === "print" && (
        <p className="prop-field__hint">{t("design.skeleton.printCurrent")}</p>
      )}
      <p className="prop-field__hint">{t("design.skeleton.hint.sheet")}</p>
    </>
  );
};

const sameLayout = (a: DocumentLayout, b: DocumentLayout): boolean =>
  sameTemplate(
    { label: "a", components: {}, layout: a },
    {
      label: "a",
      components: {},
      layout: b,
    },
  );

const DocumentSkeleton = ({
  layout,
  onChange,
}: {
  layout: DocumentLayout;
  onChange: (layout: DocumentLayout) => void;
}) => {
  const { t } = useLanguage();
  const presets = Object.entries(LAYOUT_PRESETS.document);
  const custom = !presets.some(([, preset]) =>
    sameLayout(preset.layout, layout),
  );
  return (
    <ChoiceGroup legend={t("design.skeleton.document")}>
      {presets.map(([id, preset]) => (
        <ChoiceCard
          key={id}
          name="skeleton-document"
          checked={sameLayout(preset.layout, layout)}
          label={t(`design.skeleton.document.${id}` as MessageKey)}
          onSelect={() => onChange(preset.layout)}
        >
          <DocumentMini layout={preset.layout} />
        </ChoiceCard>
      ))}
      {custom && (
        <ChoiceCard
          name="skeleton-document"
          checked
          label={t("design.skeleton.document.current")}
          onSelect={() => undefined}
        >
          <DocumentMini layout={layout} />
        </ChoiceCard>
      )}
    </ChoiceGroup>
  );
};

// 節の中身だけを返す(見出しは呼び出し側の Section が出す)
export const SkeletonPanel = ({
  surface,
  layout,
  onChange,
}: {
  surface: LayoutSurface;
  layout: DocumentLayout | SheetLayout;
  onChange: (layout: DocumentLayout | SheetLayout) => void;
}) => {
  const { t } = useLanguage();
  // 質問票は選択肢の下に、見本の一覧が開閉できることを添える
  return surface === "sheet" ? (
    <SheetSkeleton layout={layout as SheetLayout} onChange={onChange} />
  ) : (
    <>
      <p className="prop-field__hint">{t("design.skeleton.hint.document")}</p>
      <DocumentSkeleton layout={layout as DocumentLayout} onChange={onChange} />
    </>
  );
};
