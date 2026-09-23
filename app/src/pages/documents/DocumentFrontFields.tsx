import type { ReactNode } from "react";
import { useLanguage } from "../../i18n/language";
import type { DocumentFile } from "../../schema/document";
import {
  CheckboxField,
  ItemList,
  SelectField,
  TextField,
} from "../editor/fields";

// 表紙まわり。セクションに属さない、紙の上端・題・要約・目次・脇・下端。
// どれも中身だけで、置き場所はテンプレートの layout.areas が決める

type Head = DocumentFile["head"];
type Summary = NonNullable<DocumentFile["summary"]>;
type Signature = NonNullable<DocumentFile["signature"]>;
type Aside = NonNullable<DocumentFile["aside"]>;
type Foot = NonNullable<DocumentFile["foot"]>;
type GlossaryItem = Aside["glossary"][number];

const blank = (value: string): string | undefined =>
  value === "" ? undefined : value;

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="prop-section">
    <h4 className="prop-section__title">{title}</h4>
    {children}
  </section>
);

const HeadFields = ({
  head,
  onChange,
}: {
  head: Head;
  onChange: (head: Head) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("doc.headTitle")}
        value={head.title}
        onCommit={(title) => onChange({ ...head, title })}
      />
      <TextField
        label={t("doc.headLede")}
        multiline
        rows={3}
        hint={t("doc.headLedeHint")}
        value={head.lede ?? ""}
        onCommit={(lede) => onChange({ ...head, lede: blank(lede) })}
      />
    </>
  );
};

const SummaryFields = ({
  summary,
  onChange,
}: {
  summary: Summary;
  onChange: (summary: Summary) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.label")}
        hint={t("doc.summaryLabelHint")}
        value={summary.label ?? ""}
        onCommit={(label) => onChange({ ...summary, label: blank(label) })}
      />
      <TextField
        label={t("field.body")}
        multiline
        rows={4}
        value={summary.text}
        onCommit={(text) => onChange({ ...summary, text })}
      />
    </>
  );
};

const SignatureFields = ({
  signature,
  onChange,
}: {
  signature: Signature;
  onChange: (signature: Signature) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("doc.org")}
        hint={t("doc.signatureOrgHint")}
        value={signature.org}
        onCommit={(org) => onChange({ ...signature, org })}
      />
      <TextField
        label={t("doc.signatureNote")}
        hint={t("doc.signatureNoteHint")}
        value={signature.note ?? ""}
        onCommit={(note) => onChange({ ...signature, note: blank(note) })}
      />
    </>
  );
};

const AsideFields = ({
  aside,
  onChange,
}: {
  aside: Aside;
  onChange: (aside: Aside) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("field.label")}
        value={aside.label}
        onCommit={(label) => onChange({ ...aside, label })}
      />
      <ItemList<GlossaryItem>
        label={t("doc.glossary")}
        items={aside.glossary}
        create={() => ({ term: "", description: "" })}
        onChange={(glossary) => onChange({ ...aside, glossary })}
        renderItem={(item, update) => (
          <>
            <TextField
              label={t("doc.term")}
              value={item.term}
              onCommit={(term) => update({ ...item, term })}
            />
            <TextField
              label={t("doc.termDescription")}
              multiline
              rows={2}
              value={item.description}
              onCommit={(description) => update({ ...item, description })}
            />
          </>
        )}
      />
    </>
  );
};

const FootFields = ({
  foot,
  onChange,
}: {
  foot: Foot;
  onChange: (foot: Foot) => void;
}) => {
  const { t } = useLanguage();
  return (
    <>
      <TextField
        label={t("doc.org")}
        value={foot.org ?? ""}
        onCommit={(org) => onChange({ ...foot, org: blank(org) })}
      />
      <CheckboxField
        label={t("field.showPage")}
        checked={foot.showPage ?? false}
        onChange={(showPage) => onChange({ ...foot, showPage })}
      />
    </>
  );
};

export const DocumentFrontFields = ({
  document,
  onChange,
}: {
  document: DocumentFile;
  onChange: (document: DocumentFile) => void;
}) => {
  const { t } = useLanguage();
  const set = (patch: Partial<DocumentFile>) =>
    onChange({ ...document, ...patch });

  return (
    <div className="prop-panel">
      <div className="prop-panel__head">
        <h3 className="prop-panel__title">{t("doc.front")}</h3>
      </div>
      <p className="prop-panel__hint">{t("doc.frontHint")}</p>

      <Group title={t("doc.head")}>
        <HeadFields head={document.head} onChange={(head) => set({ head })} />
      </Group>

      <Group title={t("doc.summary")}>
        <CheckboxField
          label={t("doc.useSummary")}
          checked={document.summary !== undefined}
          onChange={(checked) =>
            set({ summary: checked ? { text: "" } : undefined })
          }
        />
        {document.summary && (
          <SummaryFields
            summary={document.summary}
            onChange={(summary) => set({ summary })}
          />
        )}
      </Group>

      <Group title={t("doc.toc")}>
        <SelectField
          label={t("doc.tocLabel")}
          value={document.toc}
          options={[
            { value: "auto", label: t("doc.tocAuto") },
            { value: "none", label: t("doc.tocNone") },
          ]}
          onChange={(toc) => set({ toc })}
        />
      </Group>

      <Group title={t("doc.signature")}>
        <CheckboxField
          label={t("doc.useSignature")}
          checked={document.signature !== undefined}
          onChange={(checked) =>
            set({ signature: checked ? { org: "" } : undefined })
          }
        />
        {document.signature && (
          <SignatureFields
            signature={document.signature}
            onChange={(signature) => set({ signature })}
          />
        )}
      </Group>

      <Group title={t("doc.aside")}>
        <CheckboxField
          label={t("doc.useAside")}
          checked={document.aside !== undefined}
          onChange={(checked) =>
            set({
              aside: checked
                ? { label: "用語", glossary: [{ term: "", description: "" }] }
                : undefined,
            })
          }
        />
        {document.aside && (
          <AsideFields
            aside={document.aside}
            onChange={(aside) => set({ aside })}
          />
        )}
      </Group>

      <Group title={t("doc.foot")}>
        <CheckboxField
          label={t("doc.useFoot")}
          checked={document.foot !== undefined}
          onChange={(checked) => set({ foot: checked ? {} : undefined })}
        />
        {document.foot && (
          <FootFields foot={document.foot} onChange={(foot) => set({ foot })} />
        )}
      </Group>
    </div>
  );
};
