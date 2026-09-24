import "./sections.css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Pencil, X } from "lucide-react";
import type { ReactNode } from "react";
import {
  designTemplatesQuery,
  handoutPreviewUrl,
  handoutQuery,
  handoutsQuery,
  useSetHandoutFavorite,
  useSetHandoutTemplate,
} from "../../api/queries";
import type {
  DesignTemplateSummary,
  HandoutKind,
  HandoutSummary,
} from "../../api/types";
import { HandoutExportButton } from "../../components/HandoutExportButton";
import { favoriteControlOf } from "../../components/ListCardParts";
import { PinnedSections } from "../../components/PinnedSections";
import { ShareButton } from "../../components/ShareButton";
import { formatDateTime } from "../../format/date";
import { useLanguage } from "../../i18n/language";
import { SearchButton } from "../../search/SearchButton";
import { FrameView } from "../design/SampleStage";
import { templateEditPath } from "../templates/paths";
import { HandoutCard } from "./HandoutCard";
import { sectionListPath } from "./paths";

// 質問票と HTML 資料の資料一覧と、質問票の1件。
// 質問票の中身は AI が書いて CLI で保存するので、ここでできるのは見本・テンプレートの入れ替え・書き出しだけ。
// HTML 資料の1件は編集画面(app/src/pages/documents/、段 K の 51)

export type Section = HandoutKind;

export const SectionListPage = ({ section }: { section: Section }) => {
  const { t } = useLanguage();
  const handouts = useQuery(handoutsQuery(section));
  const setFavorite = useSetHandoutFavorite(section);

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t(`sections.${section}.listTitle`)}</h1>
          <p className="page-lead">{t(`sections.${section}.lead`)}</p>
        </div>
        <SearchButton />
      </header>

      {handouts.isPending && (
        <p className="state-message">{t("common.loading")}</p>
      )}
      {handouts.isError && (
        <p className="state-message state-message--error">
          {handouts.error.message}
        </p>
      )}
      {handouts.isSuccess && handouts.data.length === 0 && (
        <p className="state-message">{t(`sections.${section}.howTo`)}</p>
      )}
      {handouts.isSuccess && handouts.data.length > 0 && (
        <PinnedSections
          items={handouts.data}
          pinned={(summary) => summary.favorite}
          title={t("list.favorites")}
          renderCard={(summary) => (
            <HandoutCard
              key={summary.id}
              summary={summary}
              favoriteControl={favoriteControlOf(setFavorite, summary.id)}
            />
          )}
        />
      )}
    </div>
  );
};

// 上の帯のテンプレートの欄と ✎。HTML 資料の編集画面の帯(DocumentBar)と同じ形
const TemplatePicker = ({
  section,
  id,
  current,
  templates,
}: {
  section: Section;
  id: string;
  current: string;
  templates: readonly DesignTemplateSummary[];
}) => {
  const { t } = useLanguage();
  const setTemplate = useSetHandoutTemplate(section, id);
  return (
    <>
      <label className="handout-bar__field">
        <select
          className="input"
          aria-label={t("handouts.template")}
          title={t("handouts.template")}
          value={current}
          disabled={setTemplate.isPending}
          onChange={(event) => setTemplate.mutate(event.target.value)}
        >
          {templates.map((template) => (
            <option key={template.name} value={template.name}>
              {template.label}
            </option>
          ))}
        </select>
      </label>
      <Link
        to={templateEditPath[section]}
        params={{ name: current }}
        className="button button--ghost button--icon"
        title={t("handouts.editTemplate")}
        aria-label={t("handouts.editTemplate")}
      >
        <Pencil size={18} aria-hidden />
      </Link>
      {setTemplate.isError && (
        <div className="export-notice" role="alert">
          <p className="export-notice__title export-notice__title--error">
            {setTemplate.error.message}
          </p>
          <button
            type="button"
            className="icon-button export-notice__close"
            aria-label={t("export.closeNotice")}
            onClick={() => setTemplate.reset()}
          >
            <X size={16} aria-hidden />
          </button>
        </div>
      )}
    </>
  );
};

const MetaItem = ({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) => (
  <span className="handout-meta__item">
    {label}
    <strong>{children}</strong>
  </span>
);

// 質問票の1件のページの、上の帯の下の細い1行(105・案2)。
// カードから外した ID・レイアウト・問数・回答・作成日時・更新日時
export const HandoutMetaRow = ({ handout }: { handout: HandoutSummary }) => {
  const { t } = useLanguage();
  return (
    <p className="handout-meta">
      <MetaItem label={t("handouts.id")}>
        <code>{handout.id}</code>
      </MetaItem>
      {handout.kind === "sheet" && handout.layout && (
        <MetaItem label={t("handouts.layout")}>
          {t(`design.layout.${handout.layout}`)}
        </MetaItem>
      )}
      {handout.questionCount !== undefined && (
        <MetaItem label={t("handouts.questions")}>
          {t("unit.questions", { n: handout.questionCount })}
        </MetaItem>
      )}
      {handout.questionCount !== undefined && (
        <MetaItem label={t("handouts.answers")}>
          {handout.hasAnswers
            ? t("handouts.answered")
            : t("handouts.notAnswered")}
        </MetaItem>
      )}
      <MetaItem label={t("handouts.createdAt")}>
        <time dateTime={handout.createdAt}>
          {formatDateTime(handout.createdAt)}
        </time>
      </MetaItem>
      <MetaItem label={t("handouts.updatedAt")}>
        <time dateTime={handout.updatedAt}>
          {formatDateTime(handout.updatedAt)}
        </time>
      </MetaItem>
    </p>
  );
};

// 1枚の HTML をそのままの大きさで別のタブに開く。回答欄に書き込むときはこちら
const OpenFullLink = ({ section, id }: { section: Section; id: string }) => {
  const { t } = useLanguage();
  return (
    <a
      className="button button--ghost button--icon"
      href={handoutPreviewUrl(section, id)}
      target="_blank"
      rel="noreferrer"
      aria-label={t("handouts.openFull")}
      title={t("handouts.openFull")}
    >
      <ExternalLink size={18} aria-hidden />
    </a>
  );
};

export const SectionDetailPage = ({
  section,
  id,
}: {
  section: Section;
  id: string;
}) => {
  const { t } = useLanguage();
  const handout = useQuery(handoutQuery(section, id));
  const design = useQuery(designTemplatesQuery);
  const templates = design.data?.templates[section] ?? [];

  const title = handout.data?.title ?? id;
  return (
    <div className="handout-detail">
      {/* ボタンはアイコンだけにして、帯を1行に収める */}
      <header className="viewer__bar viewer__bar--single">
        <Link
          to={sectionListPath[section]}
          className="button button--ghost button--icon"
          aria-label={t("handouts.backToList")}
          title={t("handouts.backToList")}
        >
          <ArrowLeft size={18} aria-hidden />
        </Link>
        <span className="viewer__divider" aria-hidden />
        <h1 className="viewer__title" title={title}>
          {title}
        </h1>
        {handout.data && (
          <>
            <TemplatePicker
              section={section}
              id={id}
              current={handout.data.template}
              templates={templates}
            />
            <OpenFullLink section={section} id={id} />
            <HandoutExportButton kind={section} id={id} />
            <ShareButton
              kind={section}
              id={id}
              sharedUrl={handout.data.shareUrl ?? null}
            />
          </>
        )}
      </header>

      {handout.isPending && (
        <p className="state-message">{t("common.loading")}</p>
      )}
      {handout.isError && (
        <p className="state-message state-message--error">
          {handout.error.message}
        </p>
      )}
      {handout.data && <HandoutMetaRow handout={handout.data} />}
      {handout.data &&
        (handout.data.error ? (
          <p className="state-message state-message--error">
            {handout.data.error}
          </p>
        ) : (
          <div className="handout-detail__stage">
            <div className="handout-preview">
              <FrameView
                key={handout.data.updatedAt}
                src={handoutPreviewUrl(section, id)}
                title={handout.data.title}
                // 倍率は切り替えず、いつも画面に合わせる。縮めずに枠の幅で等倍に描く
                fitWidth
                // 質問票は中のボタンで質問を移動し、HTML 資料はコードブロックをコピーする
                interactive
              />
            </div>
          </div>
        ))}
    </div>
  );
};
