import type { ReactNode } from "react";
import type { MessageKey } from "../../i18n/ja";
import { useLanguage } from "../../i18n/language";
import { SearchButton } from "../../search/SearchButton";

// 使い方。エージェントに頼んだあと何が起きて何ができあがるかを、区分ごとのセクションで読む。
// 読むだけの文章で、頭の目次から各セクションへ飛ぶ。幅はほかの画面と同じく決めない

type Block =
  | { kind: "p"; key: MessageKey }
  | { kind: "h3"; key: MessageKey }
  | { kind: "ol" | "ul"; keys: readonly MessageKey[] };

type Section = { id: string; title: MessageKey; blocks: readonly Block[] };

const p = (key: MessageKey): Block => ({ kind: "p", key });
const h3 = (key: MessageKey): Block => ({ kind: "h3", key });
const ol = (...keys: MessageKey[]): Block => ({ kind: "ol", keys });
const ul = (...keys: MessageKey[]): Block => ({ kind: "ul", keys });

const SECTIONS: readonly Section[] = [
  {
    id: "flow",
    title: "help.flowTitle",
    blocks: [
      p("help.flowLead"),
      ol("help.flow1", "help.flow2", "help.flow3", "help.flow4", "help.flow5"),
      h3("help.tipsTitle"),
      ul("help.tip1", "help.tip2", "help.tip3", "help.tip4", "help.tip5"),
    ],
  },
  {
    id: "slides",
    title: "help.slideTitle",
    blocks: [
      h3("help.sub.ask"),
      p("help.slideAsk"),
      h3("help.sub.agent"),
      ol(
        "help.slideAgent1",
        "help.slideAgent2",
        "help.slideAgent3",
        "help.slideAgent4",
      ),
      h3("help.sub.result"),
      p("help.slideResult"),
      h3("help.talkTitle"),
      p("help.talkLead"),
      ul("help.talk1", "help.talk2", "help.talk3", "help.talk4"),
      h3("help.sub.edit"),
      p("help.slideEditLead"),
      ul(
        "help.slideEdit1",
        "help.slideEdit2",
        "help.slideEdit3",
        "help.slideEdit4",
        "help.slideEdit5",
        "help.slideEdit6",
      ),
      h3("help.sub.ai"),
      p("help.slideAi"),
      h3("help.sub.export"),
      p("help.slideExportLead"),
      ul(
        "help.slideExport1",
        "help.slideExport2",
        "help.slideExport3",
        "help.slideExport4",
      ),
      p("help.slideExportNote"),
      p("help.slideShareNote"),
    ],
  },
  {
    id: "sheets",
    title: "help.sheetTitle",
    blocks: [
      p("help.sheetLead"),
      h3("help.sheetWhenTitle"),
      ul("help.sheetWhen1", "help.sheetWhen2"),
      h3("help.sub.agent"),
      ol("help.sheetAgent1", "help.sheetAgent2"),
      h3("help.sub.result"),
      ul("help.sheetResult1", "help.sheetResult2"),
      h3("help.sheetAnswerTitle"),
      ul(
        "help.sheetAnswer1",
        "help.sheetAnswer2",
        "help.sheetAnswer3",
        "help.sheetAnswer4",
      ),
      h3("help.sub.edit"),
      p("help.sheetEditLead"),
      ul(
        "help.sheetEdit1",
        "help.sheetEdit2",
        "help.sheetEdit3",
        "help.sheetEdit4",
      ),
      p("help.sheetEditNote"),
      h3("help.sub.share"),
      p("help.sheetShare1"),
      p("help.sheetShare2"),
      p("help.sheetShare3"),
      p("help.sheetShare4"),
    ],
  },
  {
    id: "documents",
    title: "help.documentTitle",
    blocks: [
      h3("help.sub.ask"),
      p("help.documentAsk"),
      h3("help.sub.agent"),
      ol("help.documentAgent1", "help.documentAgent2", "help.documentAgent3"),
      h3("help.sub.result"),
      p("help.documentResult"),
      h3("help.sub.edit"),
      p("help.documentEditLead"),
      ul(
        "help.documentEdit1",
        "help.documentEdit2",
        "help.documentEdit3",
        "help.documentEdit4",
        "help.documentEdit5",
      ),
      h3("help.sub.ai"),
      p("help.documentAi"),
      h3("help.sub.export"),
      p("help.documentExport"),
      h3("help.sub.share"),
      p("help.documentShare1"),
      p("help.documentShare2"),
      p("help.documentShare3"),
    ],
  },
  {
    id: "templates",
    title: "help.templateTitle",
    blocks: [
      p("help.templateLead"),
      ul(
        "help.template1",
        "help.template2",
        "help.template3",
        "help.template4",
      ),
    ],
  },
  {
    id: "lists",
    title: "help.listTitle",
    blocks: [ul("help.list1", "help.list2", "help.list3", "help.list4")],
  },
  {
    id: "phone",
    title: "help.phoneTitle",
    blocks: [
      p("help.phoneLead"),
      ul("help.phone1", "help.phone2", "help.phone3", "help.phone4"),
    ],
  },
  {
    id: "files",
    title: "help.filesTitle",
    blocks: [p("help.files1"), p("help.files2"), p("help.files3")],
  },
  {
    id: "settings",
    title: "help.settingsTitle",
    blocks: [p("help.settings1")],
  },
];

// 文言の中の `…` をコードの字にする。区切りの奇数番目がコード
const inline = (text: string): ReactNode[] =>
  text.split("`").map((part, index) =>
    index % 2 === 1 ? (
      // biome-ignore lint/suspicious/noArrayIndexKey: 固定の文言を区切った並びで、順番が変わらない
      <code key={index}>{part}</code>
    ) : (
      part
    ),
  );

// 1つのセクションの中で重ならない名前。小見出しと段落は文言のキー、並びは先頭の項目のキー
const blockId = (block: Block): string =>
  "key" in block
    ? `${block.kind}:${block.key}`
    : `${block.kind}:${block.keys[0]}`;

const BlockView = ({ block }: { block: Block }) => {
  const { t } = useLanguage();
  if (block.kind === "h3") return <h3>{t(block.key)}</h3>;
  if (block.kind === "p") return <p>{inline(t(block.key))}</p>;
  const items = block.keys.map((key) => <li key={key}>{inline(t(key))}</li>);
  return block.kind === "ol" ? <ol>{items}</ol> : <ul>{items}</ul>;
};

export const HelpPage = () => {
  const { t } = useLanguage();
  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t("help.title")}</h1>
          <p className="page-lead">{t("help.lead")}</p>
        </div>
        <SearchButton />
      </header>

      <nav className="prose-toc" aria-label={t("help.toc")}>
        <ol>
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a href={`#help-${section.id}`}>{t(section.title)}</a>
            </li>
          ))}
        </ol>
      </nav>

      {SECTIONS.map((section) => (
        <section
          key={section.id}
          id={`help-${section.id}`}
          className="prose-section"
          aria-labelledby={`help-${section.id}-title`}
        >
          <h2 id={`help-${section.id}-title`}>{t(section.title)}</h2>
          {section.blocks.map((block) => (
            <BlockView key={blockId(block)} block={block} />
          ))}
        </section>
      ))}
    </div>
  );
};
