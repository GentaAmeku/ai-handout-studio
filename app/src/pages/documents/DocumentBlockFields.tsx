import { type ReactNode, useState } from "react";
import {
  headersToText,
  rowsToText,
  textToTable,
} from "../../editor/table-text";
import { useLanguage } from "../../i18n/language";
import {
  checkDocumentBody,
  type DocumentBlock,
  type DocumentBlockType,
} from "../../schema/document";
import {
  CheckboxField,
  ItemList,
  SelectField,
  TextField,
} from "../editor/fields";

// type ごとの入力欄。スライドの BlockFields.tsx と同じ書き方で、
// props に無いキーは足さない。色・余白・字サイズはテンプレートが持つので欄を作らない

type BlockOf<T extends DocumentBlockType> = Extract<DocumentBlock, { type: T }>;

type FieldsProps<T extends DocumentBlockType> = {
  block: BlockOf<T>;
  onChange: (block: BlockOf<T>) => void;
};

type OrderedItem = BlockOf<"ordered">["props"]["items"][number];
type CardItem = BlockOf<"cards">["props"]["items"][number];

const linesToItems = (text: string): string[] =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");

// 0 から数えた列番号。数でない字と負の数は落とす
const textToColumns = (text: string): number[] =>
  text
    .split(/[,、\s]+/)
    .map((part) => Number(part))
    .filter((value) => Number.isInteger(value) && value >= 0);

// 図と移行の受け皿。本文の断片と同じ検査を通ったものだけ入れ、落ちたら理由を出して直してもらう
const HtmlField = ({
  label,
  hint,
  value,
  onCommit,
}: {
  label: string;
  hint: string;
  value: string;
  onCommit: (html: string) => void;
}) => {
  const [error, setError] = useState<string>();
  return (
    <>
      <TextField
        label={label}
        hint={hint}
        multiline
        rows={10}
        value={value}
        onCommit={(html) => {
          const checked = checkDocumentBody(html);
          setError(checked.success ? undefined : checked.message);
          if (checked.success) onCommit(html);
        }}
      />
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </>
  );
};

const TextFields = ({ block, onChange }: FieldsProps<"text">) => {
  const { t } = useLanguage();
  return (
    <TextField
      label={t("field.body")}
      multiline
      rows={6}
      hint={t("doc.field.textHint")}
      value={block.props.text}
      onCommit={(text) => onChange({ ...block, props: { text } })}
    />
  );
};

const BulletsFields = ({ block, onChange }: FieldsProps<"bullets">) => {
  const { t } = useLanguage();
  return (
    <TextField
      label={t("field.items")}
      multiline
      rows={6}
      hint={t("field.itemsHint")}
      value={block.props.items.join("\n")}
      onCommit={(text) =>
        onChange({ ...block, props: { items: linesToItems(text) } })
      }
    />
  );
};

const OrderedFields = ({ block, onChange }: FieldsProps<"ordered">) => {
  const { t } = useLanguage();
  return (
    <ItemList<OrderedItem>
      label={t("field.steps")}
      items={block.props.items}
      create={() => ({ text: "手順" })}
      onChange={(items) => onChange({ ...block, props: { items } })}
      renderItem={(item, update) => (
        <>
          <TextField
            label={t("field.body")}
            multiline
            rows={2}
            value={item.text}
            onCommit={(text) => update({ ...item, text })}
          />
          <TextField
            label={t("doc.field.why")}
            hint={t("doc.field.whyHint")}
            value={item.why ?? ""}
            onCommit={(why) =>
              update({ ...item, why: why === "" ? undefined : why })
            }
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
  const numeric = block.props.numeric ?? [];
  return (
    <>
      <TextField
        label={t("field.headers")}
        hint={t("field.headersHint")}
        value={headersText}
        onCommit={(text) =>
          onChange({
            ...block,
            props: { ...block.props, ...textToTable(text, rowsText) },
          })
        }
      />
      <TextField
        label={t("field.rows")}
        multiline
        rows={8}
        hint={t("field.rowsHint")}
        value={rowsText}
        onCommit={(text) =>
          onChange({
            ...block,
            props: { ...block.props, ...textToTable(headersText, text) },
          })
        }
      />
      <CheckboxField
        label={t("doc.field.rowLabel")}
        checked={block.props.rowLabel ?? false}
        onChange={(rowLabel) =>
          onChange({
            ...block,
            props: {
              ...block.props,
              ...(rowLabel ? { rowLabel } : { rowLabel: undefined }),
            },
          })
        }
      />
      <TextField
        label={t("doc.field.numeric")}
        hint={t("doc.field.numericHint")}
        value={numeric.join(", ")}
        onCommit={(text) => {
          const columns = textToColumns(text);
          onChange({
            ...block,
            props: {
              ...block.props,
              numeric: columns.length > 0 ? columns : undefined,
            },
          });
        }}
      />
    </>
  );
};

const CardsFields = ({ block, onChange }: FieldsProps<"cards">) => {
  const { t } = useLanguage();
  return (
    <>
      <SelectField
        label={t("field.columns")}
        value={block.props.columns === 3 ? "3" : "2"}
        options={[
          { value: "2", label: t("field.columns2") },
          { value: "3", label: t("field.columns3") },
        ]}
        onChange={(columns) =>
          onChange({
            ...block,
            props: { ...block.props, columns: columns === "3" ? 3 : 2 },
          })
        }
      />
      <ItemList<CardItem>
        label={t("field.cards")}
        items={block.props.items}
        max={6}
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
              rows={3}
              value={item.body}
              onCommit={(body) => update({ ...item, body })}
            />
          </>
        )}
      />
    </>
  );
};

const NoticeFields = ({ block, onChange }: FieldsProps<"notice">) => {
  const { t } = useLanguage();
  return (
    <>
      <SelectField
        label={t("doc.field.kind")}
        value={block.props.kind}
        options={[
          { value: "info", label: t("doc.field.kindInfo") },
          { value: "success", label: t("doc.field.kindSuccess") },
          { value: "warning", label: t("doc.field.kindWarning") },
        ]}
        onChange={(kind) =>
          onChange({ ...block, props: { ...block.props, kind } })
        }
      />
      <TextField
        label={t("field.label")}
        hint={t("doc.field.noticeLabelHint")}
        value={block.props.label ?? ""}
        onCommit={(label) =>
          onChange({
            ...block,
            props: {
              ...block.props,
              label: label === "" ? undefined : label,
            },
          })
        }
      />
      <TextField
        label={t("field.body")}
        multiline
        rows={4}
        value={block.props.text}
        onCommit={(text) =>
          onChange({ ...block, props: { ...block.props, text } })
        }
      />
    </>
  );
};

// note・alert・open は本文だけを持つ。先頭の言葉(補足・危険)は描画側が付ける
const TextOnlyFields = ({
  text,
  rows,
  onCommit,
}: {
  text: string;
  rows: number;
  onCommit: (text: string) => void;
}) => {
  const { t } = useLanguage();
  return (
    <TextField
      label={t("field.body")}
      multiline
      rows={rows}
      value={text}
      onCommit={onCommit}
    />
  );
};

const QuoteFields = ({ block, onChange }: FieldsProps<"quote">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.body")}
        multiline
        rows={4}
        value={block.props.text}
        onCommit={(text) =>
          onChange({ ...block, props: { ...block.props, text } })
        }
      />
      <TextField
        label={t("doc.field.source")}
        value={block.props.source ?? ""}
        onCommit={(source) =>
          onChange({
            ...block,
            props: {
              ...block.props,
              source: source === "" ? undefined : source,
            },
          })
        }
      />
    </>
  );
};

const CodeFields = ({ block, onChange }: FieldsProps<"code">) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("doc.field.code")}
        multiline
        rows={8}
        value={block.props.text}
        onCommit={(text) =>
          onChange({ ...block, props: { ...block.props, text } })
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

const FigureFields = ({ block, onChange }: FieldsProps<"figure">) => {
  const { t } = useLanguage();
  return (
    <>
      <HtmlField
        label={t("doc.field.figureHtml")}
        hint={t("doc.field.figureHtmlHint")}
        value={block.props.html}
        onCommit={(html) =>
          onChange({ ...block, props: { ...block.props, html } })
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

// 画像。ファイルの追加と差し替えは画面に持たず、エージェントに頼む。直せるのは説明の文字だけ
const ImageFields = ({ block, onChange }: FieldsProps<"image">) => {
  const { t } = useLanguage();
  return (
    <>
      <p className="prop-panel__hint">
        {t("doc.field.imageSrc", { src: block.props.src })}
      </p>
      <TextField
        label={t("doc.field.alt")}
        hint={t("doc.field.altHint")}
        value={block.props.alt}
        onCommit={(alt) =>
          onChange({ ...block, props: { ...block.props, alt } })
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

const HtmlFields = ({ block, onChange }: FieldsProps<"html">) => {
  const { t } = useLanguage();
  return (
    <HtmlField
      label={t("doc.field.html")}
      hint={t("doc.field.htmlHint")}
      value={block.props.html}
      onCommit={(html) => onChange({ ...block, props: { html } })}
    />
  );
};

type FieldsComponent<T extends DocumentBlockType> = (
  props: FieldsProps<T>,
) => ReactNode;

const registry: { [T in DocumentBlockType]: FieldsComponent<T> } = {
  text: TextFields,
  bullets: BulletsFields,
  ordered: OrderedFields,
  table: TableFields,
  cards: CardsFields,
  notice: NoticeFields,
  note: ({ block, onChange }) => (
    <TextOnlyFields
      text={block.props.text}
      rows={3}
      onCommit={(text) => onChange({ ...block, props: { text } })}
    />
  ),
  alert: ({ block, onChange }) => (
    <TextOnlyFields
      text={block.props.text}
      rows={3}
      onCommit={(text) => onChange({ ...block, props: { text } })}
    />
  ),
  open: ({ block, onChange }) => (
    <TextOnlyFields
      text={block.props.text}
      rows={4}
      onCommit={(text) => onChange({ ...block, props: { text } })}
    />
  ),
  quote: QuoteFields,
  code: CodeFields,
  figure: FigureFields,
  image: ImageFields,
  html: HtmlFields,
};

export const DocumentBlockFields = ({
  block,
  onChange,
}: {
  block: DocumentBlock;
  onChange: (block: DocumentBlock) => void;
}) => {
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const Fields = registry[block.type] as FieldsComponent<DocumentBlockType>;
  return <Fields block={block} onChange={onChange} />;
};
