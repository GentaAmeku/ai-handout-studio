import type { ReactNode } from "react";
import {
  headersToText,
  rowsToText,
  textToTable,
} from "../../editor/table-text";
import { useLanguage } from "../../i18n/language";
import type { BlockOf, KnownBlock, KnownBlockType } from "../../schema/block";
import { iconNames } from "../../schema/icons";
import {
  CheckboxField,
  ItemList,
  type Option,
  SelectField,
  TextField,
} from "./fields";

// type ごとの入力欄。props に無いキーは足さない(色や書体を持たせない)

type FieldsProps<T extends KnownBlockType> = {
  block: BlockOf<T>;
  onChange: (block: BlockOf<T>) => void;
};

type CardItem = BlockOf<"card-grid">["props"]["items"][number];
type KpiItem = BlockOf<"kpi-row">["props"]["items"][number];

const linesToItems = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

const HeadingFields = ({ block, onChange }: FieldsProps<"heading">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.kicker")}
        value={block.props.kicker ?? ""}
        onCommit={(kicker) =>
          onChange({ ...block, props: { ...block.props, kicker } })
        }
      />
      <TextField
        label={t("field.heading")}
        multiline
        rows={2}
        value={block.props.text}
        onCommit={(text) =>
          onChange({ ...block, props: { ...block.props, text } })
        }
      />
      <SelectField
        label={t("field.size")}
        value={block.props.level === 1 ? "1" : "2"}
        options={[
          { value: "1", label: t("field.sizeLarge") },
          { value: "2", label: t("field.sizeMedium") },
        ]}
        onChange={(level) =>
          onChange({
            ...block,
            props: { ...block.props, level: level === "1" ? 1 : 2 },
          })
        }
      />
    </>
  );
};

const TextFields = ({ block, onChange }: FieldsProps<"text">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.body")}
        multiline
        rows={5}
        value={block.props.text}
        onCommit={(text) =>
          onChange({ ...block, props: { ...block.props, text } })
        }
      />
      <SelectField
        label={t("field.align")}
        value={block.props.align ?? "left"}
        options={[
          { value: "left", label: t("field.alignLeft") },
          { value: "center", label: t("field.alignCenter") },
          { value: "right", label: t("field.alignRight") },
        ]}
        onChange={(align) =>
          onChange({ ...block, props: { ...block.props, align } })
        }
      />
    </>
  );
};

const BulletsFields = ({ block, onChange }: FieldsProps<"bullets">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.items")}
        multiline
        rows={5}
        hint={t("field.itemsHint")}
        value={block.props.items.join("\n")}
        onCommit={(text) =>
          onChange({
            ...block,
            props: { ...block.props, items: linesToItems(text) },
          })
        }
      />
      <SelectField
        label={t("field.marker")}
        value={block.props.marker ?? "disc"}
        options={[
          { value: "disc", label: t("field.markerDisc") },
          { value: "number", label: t("field.markerNumber") },
        ]}
        onChange={(marker) =>
          onChange({ ...block, props: { ...block.props, marker } })
        }
      />
    </>
  );
};

const CardGridFields = ({ block, onChange }: FieldsProps<"card-grid">) => {
  const { t } = useLanguage();
  const iconOptions: readonly Option<string>[] = [
    { value: "", label: t("field.noIcon") },
    ...iconNames.map((name) => ({ value: name, label: name })),
  ];
  return (
    <>
      <SelectField
        label={t("field.columns")}
        value={String(block.props.columns) as "2" | "3" | "4"}
        options={[
          { value: "2", label: t("field.columns2") },
          { value: "3", label: t("field.columns3") },
          { value: "4", label: t("field.columns4") },
        ]}
        onChange={(columns) =>
          onChange({
            ...block,
            props: { ...block.props, columns: Number(columns) as 2 | 3 | 4 },
          })
        }
      />
      <ItemList<CardItem>
        label={t("field.cards")}
        items={block.props.items}
        max={8}
        create={() => ({ title: "タイトル", body: "本文" })}
        onChange={(items) =>
          onChange({ ...block, props: { ...block.props, items } })
        }
        renderItem={(item, update) => (
          <>
            <TextField
              label={t("field.title")}
              value={item.title}
              onCommit={(title) => update({ ...item, title })}
            />
            <TextField
              label={t("field.body")}
              multiline
              rows={2}
              value={item.body}
              onCommit={(body) => update({ ...item, body })}
            />
            <SelectField
              label={t("field.icon")}
              value={item.icon ?? ""}
              options={iconOptions}
              onChange={(icon) =>
                update({ ...item, icon: icon === "" ? undefined : icon })
              }
            />
          </>
        )}
      />
    </>
  );
};

const KpiRowFields = ({ block, onChange }: FieldsProps<"kpi-row">) => {
  const { t } = useLanguage();
  return (
    <ItemList<KpiItem>
      label={t("field.figures")}
      items={block.props.items}
      max={4}
      create={() => ({ value: "[[要確認]]", label: "指標" })}
      onChange={(items) =>
        onChange({ ...block, props: { ...block.props, items } })
      }
      renderItem={(item, update) => (
        <>
          <TextField
            label={t("field.value")}
            value={item.value}
            hint={t("field.valueHint")}
            onCommit={(value) => update({ ...item, value })}
          />
          <TextField
            label={t("field.label")}
            value={item.label}
            onCommit={(label) => update({ ...item, label })}
          />
          <TextField
            label={t("field.note")}
            value={item.note ?? ""}
            onCommit={(note) =>
              update({ ...item, note: note === "" ? undefined : note })
            }
          />
        </>
      )}
    />
  );
};

const TwoColFields = ({ block, onChange }: FieldsProps<"two-col">) => {
  const { t } = useLanguage();
  return (
    <>
      {(["left", "right"] as const).map((side) => (
        <fieldset key={side} className="prop-list">
          <legend className="prop-field__label">
            {side === "left" ? t("field.leftColumn") : t("field.rightColumn")}
          </legend>
          <TextField
            label={t("field.title")}
            value={block.props[side].title ?? ""}
            onCommit={(title) =>
              onChange({
                ...block,
                props: {
                  ...block.props,
                  [side]: {
                    ...block.props[side],
                    title: title === "" ? undefined : title,
                  },
                },
              })
            }
          />
          <TextField
            label={t("field.body")}
            multiline
            rows={4}
            value={block.props[side].body}
            onCommit={(body) =>
              onChange({
                ...block,
                props: {
                  ...block.props,
                  [side]: { ...block.props[side], body },
                },
              })
            }
          />
        </fieldset>
      ))}
    </>
  );
};

const ProcessFields = ({ block, onChange }: FieldsProps<"process">) => {
  const { t } = useLanguage();
  return (
    <ItemList
      label={t("field.steps")}
      items={block.props.steps}
      max={6}
      create={() => ({ title: "ステップ", body: "内容" })}
      onChange={(steps) =>
        onChange({ ...block, props: { ...block.props, steps } })
      }
      renderItem={(step, update) => (
        <>
          <TextField
            label={t("field.title")}
            value={step.title}
            onCommit={(title) => update({ ...step, title })}
          />
          <TextField
            label={t("field.body")}
            multiline
            rows={2}
            value={step.body}
            onCommit={(body) => update({ ...step, body })}
          />
        </>
      )}
    />
  );
};

const TableFields = ({ block, onChange }: FieldsProps<"table">) => {
  const { t } = useLanguage();
  const rowsText = rowsToText(block.props.rows);
  const headersText = headersToText(block.props.headers);
  return (
    <>
      <TextField
        label={t("field.headers")}
        hint={t("field.headersHint")}
        value={headersText}
        onCommit={(text) =>
          onChange({ ...block, props: textToTable(text, rowsText) })
        }
      />
      <TextField
        label={t("field.rows")}
        multiline
        rows={6}
        hint={t("field.rowsHint")}
        value={rowsText}
        onCommit={(text) =>
          onChange({ ...block, props: textToTable(headersText, text) })
        }
      />
    </>
  );
};

const ASSET_PATH = /^assets\/[^:\\]+$/;

const ImageFields = ({ block, onChange }: FieldsProps<"image">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.imageSrc")}
        hint={t("field.imageSrcHint")}
        value={block.props.src}
        onCommit={(value) => {
          const src = value.startsWith("assets/") ? value : `assets/${value}`;
          if (!ASSET_PATH.test(src) || src.split("/").includes("..")) return;
          onChange({ ...block, props: { ...block.props, src } });
        }}
      />
      <SelectField
        label={t("field.fit")}
        value={block.props.fit ?? "cover"}
        options={[
          { value: "cover", label: t("field.fitCover") },
          { value: "contain", label: t("field.fitContain") },
        ]}
        onChange={(fit) =>
          onChange({ ...block, props: { ...block.props, fit } })
        }
      />
      <TextField
        label={t("field.caption")}
        value={block.props.caption ?? ""}
        onCommit={(caption) =>
          onChange({
            ...block,
            props: {
              ...block.props,
              caption: caption === "" ? undefined : caption,
            },
          })
        }
      />
    </>
  );
};

const FooterFields = ({ block, onChange }: FieldsProps<"footer">) => {
  const { t } = useLanguage();
  return (
    <CheckboxField
      label={t("field.showPage")}
      checked={block.props.showPage ?? true}
      onChange={(showPage) =>
        onChange({ ...block, props: { ...block.props, showPage } })
      }
    />
  );
};

type FieldsComponent<T extends KnownBlockType> = (
  props: FieldsProps<T>,
) => ReactNode;

const registry: { [T in KnownBlockType]: FieldsComponent<T> } = {
  heading: HeadingFields,
  text: TextFields,
  bullets: BulletsFields,
  "card-grid": CardGridFields,
  "kpi-row": KpiRowFields,
  "two-col": TwoColFields,
  process: ProcessFields,
  table: TableFields,
  image: ImageFields,
  footer: FooterFields,
};

export const BlockFields = ({
  block,
  onChange,
}: {
  block: KnownBlock;
  onChange: (block: KnownBlock) => void;
}) => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const Fields = registry[block.type] as FieldsComponent<KnownBlockType>;
  return <Fields block={block} onChange={onChange} />;
};
