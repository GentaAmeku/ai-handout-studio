import { Plus, Trash2 } from "lucide-react";
import { type KeyboardEvent, type ReactNode, useId } from "react";
import { useLanguage } from "../../i18n/language";

// プロパティ欄の入力部品。文字は欄の外へ出たとき(または Enter)に確定し、
// 1回の確定を「戻す」1回分にする。値が外で変わったら key で入力欄を作り直す

const blurOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
  // 変換中の Enter は確定に使わない
  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
    event.currentTarget.blur();
  }
};

export const TextField = ({
  label,
  value,
  onCommit,
  multiline = false,
  rows = 3,
  hint,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
  multiline?: boolean;
  rows?: number;
  hint?: string;
}) => {
  const commit = (next: string) => {
    if (next !== value) onCommit(next);
  };
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="prop-field">
      <label className="prop-field__label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          key={value}
          id={id}
          className="textarea"
          defaultValue={value}
          rows={rows}
          aria-describedby={hintId}
          onBlur={(event) => commit(event.currentTarget.value)}
        />
      ) : (
        <input
          key={value}
          id={id}
          className="input"
          defaultValue={value}
          aria-describedby={hintId}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={blurOnEnter}
        />
      )}
      {hint && (
        <span id={hintId} className="prop-field__hint">
          {hint}
        </span>
      )}
    </div>
  );
};

export const NumberField = ({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: number;
  onCommit: (value: number) => void;
}) => (
  <label className="prop-field">
    <span className="prop-field__label">{label}</span>
    <input
      key={value}
      className="input"
      type="number"
      inputMode="numeric"
      step={8}
      defaultValue={value}
      onBlur={(event) => {
        const next = Number(event.currentTarget.value);
        if (Number.isFinite(next) && next !== value) onCommit(next);
      }}
      onKeyDown={blurOnEnter}
    />
  </label>
);

export type Option<T extends string> = { value: T; label: string };

export const SelectField = <T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
}) => (
  <label className="prop-field">
    <span className="prop-field__label">{label}</span>
    <select
      className="input"
      value={value}
      onChange={(event) => {
        const next = options.find(
          (option) => option.value === event.currentTarget.value,
        );
        if (next) onChange(next.value);
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </label>
);

export const CheckboxField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <label className="prop-check">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.currentTarget.checked)}
    />
    {label}
  </label>
);

// カードや手順のような、同じ形の項目の並び
export const ItemList = <T,>({
  label,
  items,
  create,
  onChange,
  renderItem,
  min = 1,
  max,
}: {
  label: string;
  items: readonly T[];
  create: () => T;
  onChange: (items: T[]) => void;
  renderItem: (item: T, update: (item: T) => void) => ReactNode;
  min?: number;
  max?: number;
}) => {
  const { t } = useLanguage();
  return (
    <fieldset className="prop-list">
      <legend className="prop-field__label">{label}</legend>
      <ol className="prop-list__items">
        {items.map((item, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 項目は id を持たず、並び順で区別する
          <li key={index} className="prop-list__item">
            <div className="prop-list__head">
              <span>{index + 1}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={t("field.deleteItem", { label, index: index + 1 })}
                disabled={items.length <= min}
                onClick={() =>
                  onChange(items.filter((_, current) => current !== index))
                }
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </div>
            {renderItem(item, (next) =>
              onChange(
                items.map((current, position) =>
                  position === index ? next : current,
                ),
              ),
            )}
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="button button--outline button--block"
        disabled={max !== undefined && items.length >= max}
        onClick={() => onChange([...items, create()])}
      >
        <Plus size={16} aria-hidden />
        {t("field.addItem", { label })}
      </button>
    </fieldset>
  );
};
