import "../design/design.css";
import { useQueries, useQuery } from "@tanstack/react-query";
import { Pencil, Star } from "lucide-react";
import {
  designTemplateQuery,
  designTemplateSampleQuery,
  designTemplatesQuery,
  useSaveDesignSelection,
} from "../../api/queries";
import type {
  DesignTemplateSummary,
  DesignTemplatesDetail,
} from "../../api/types";
import { PhotoCard, type PhotoCardLink } from "../../components/PhotoCard";
import { PinnedSections } from "../../components/PinnedSections";
import { ScaledSlide } from "../../components/ScaledSlide";
import { useRefocusAfterMove } from "../../components/useRefocusAfterMove";
import { coverSlide, sampleAssetBase } from "../../design/template-sample";
import { useLanguage } from "../../i18n/language";
import type {
  SheetLayout,
  SlideSample,
  Surface,
  Template,
} from "../../schema/design";
import { SearchButton } from "../../search/SearchButton";
import { draftVariables, resolveDraft } from "../design/draft";
import { documentPath, FrameSample, sheetPath } from "../design/SampleStage";
import { templateEditPath } from "./paths";

// 区分ごとのテンプレートの一覧。見本の1枚目だけを写真のカードにして並べ、見比べる。
// カードに合わせると(マウスでもキーボードでも)上下が暗くなり、名前と「既定にする」「編集」が出る。
// 既定のテンプレートは「既定」の見出しの下に分け、残りは見出しを付けずに線の下に並べる
// (116。資料一覧のお気に入りと同じ形)

type Variables = Readonly<Record<string, string>>;

// スライドは見本の表紙、質問票はテンプレートのレイアウトの画面、HTML 資料は紙。
// 質問票と HTML 資料は画面の幅で描き、カードの高さでページの頭を切り取る
const TemplatePreview = ({
  surface,
  name,
  template,
  variables,
  title,
  sample,
}: {
  surface: Surface;
  name: string;
  template: Template;
  variables: Variables;
  title: string;
  sample: SlideSample | null | undefined;
}) => {
  const { lang } = useLanguage();
  if (surface === "slide") {
    const cover = coverSlide(sample, lang);
    if (!cover) return null;
    return (
      <span className="photo-card__media">
        <ScaledSlide
          slide={cover}
          decorative
          context={{
            pageNumber: 1,
            pageCount: 1,
            assetBaseUrl: sampleAssetBase(name, sample),
            themeVariables: variables,
            template: name,
          }}
        />
      </span>
    );
  }
  const base =
    surface === "sheet"
      ? ((template.layout as SheetLayout | undefined)?.base ?? "focus")
      : undefined;
  return (
    <FrameSample
      path={base ? sheetPath(base, lang) : documentPath(lang)}
      template={name}
      title={title}
      variables={variables}
      decorative
    />
  );
};

const TemplateCard = ({
  surface,
  summary,
  template,
  sample,
  detail,
  onMakeDefault,
}: {
  surface: Surface;
  summary: DesignTemplateSummary;
  template: Template | undefined;
  sample: SlideSample | null | undefined;
  detail: DesignTemplatesDetail;
  // 既定でないカードの ☆ を押したとき
  onMakeDefault: () => void;
}) => {
  const { t } = useLanguage();
  const { label } = summary;
  const isDefault = detail.selection[surface] === summary.name;
  const { ref, markMoving } = useRefocusAfterMove<HTMLButtonElement>(
    `${surface}:${summary.name}`,
  );
  const resolved =
    template && resolveDraft(surface, summary.name, template, detail);
  const variables = resolved ? draftVariables(resolved) : {};
  const editLink = {
    to: templateEditPath[surface],
    params: { name: summary.name },
  } as const;
  const editLabel = t("templates.editNamed", { label });
  return (
    <PhotoCard
      articleLabel={label}
      link={
        {
          ...editLink,
          "aria-label": editLabel,
          title: t("templates.edit"),
        } as PhotoCardLink
      }
      image={
        template ? (
          <TemplatePreview
            surface={surface}
            name={summary.name}
            template={template}
            variables={variables}
            title={label}
            sample={sample}
          />
        ) : (
          <span className="design-stage design-stage--empty">
            {t("common.loading")}
          </span>
        )
      }
      icon={<Pencil size={22} strokeWidth={1.75} />}
      name={label}
      action={
        // 既定のものは ★ が塗りで、押しても何もしない
        <button
          ref={ref}
          type="button"
          className="photo-card__action template-card__action--default"
          aria-pressed={isDefault}
          aria-label={t("templates.makeDefaultNamed", { label })}
          title={t(isDefault ? "templates.isDefault" : "templates.makeDefault")}
          onClick={(event) => {
            if (isDefault) return;
            markMoving(event);
            onMakeDefault();
          }}
        >
          <Star
            size={16}
            strokeWidth={1.75}
            fill={isDefault ? "currentColor" : "none"}
            aria-hidden
          />
        </button>
      }
    />
  );
};

export const TemplateListPage = ({ surface }: { surface: Surface }) => {
  const { t, lang } = useLanguage();
  const detail = useQuery(designTemplatesQuery);
  const summaries = detail.data?.templates[surface] ?? [];
  const templates = useQueries({
    queries: summaries.map((summary) =>
      designTemplateQuery(surface, summary.name),
    ),
  });
  // 中身の見本はスライドだけが持つ。持たないテンプレートは共通の見本に落ちる
  const samples = useQueries({
    queries:
      surface === "slide"
        ? summaries.map((summary) =>
            designTemplateSampleQuery(surface, summary.name, lang),
          )
        : [],
  });
  const saveSelection = useSaveDesignSelection();
  const data = detail.data;

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <h1 className="page-title">{t(`templates.title.${surface}`)}</h1>
          <p className="page-lead">{t(`templates.lead.${surface}`)}</p>
        </div>
        <SearchButton />
      </header>

      {detail.isPending && (
        <p className="state-message">{t("common.loading")}</p>
      )}
      {detail.isError && (
        <p className="state-message state-message--error">
          {detail.error.message}
        </p>
      )}
      {saveSelection.isError && (
        <p className="form-error" role="alert">
          {saveSelection.error.message}
        </p>
      )}
      {data && (
        <PinnedSections
          // 見本とテンプレートの控えは summaries と同じ並びなので、分けても元の位置で引く
          items={summaries.map((summary, index) => ({ summary, index }))}
          pinned={({ summary }) => data.selection[surface] === summary.name}
          title={t("templates.isDefault")}
          renderCard={({ summary, index }) => (
            <TemplateCard
              key={summary.name}
              surface={surface}
              summary={summary}
              template={templates[index]?.data?.template}
              sample={samples[index]?.data?.sample}
              detail={data}
              onMakeDefault={() => {
                if (saveSelection.isPending) return;
                saveSelection.mutate({
                  ...data.selection,
                  [surface]: summary.name,
                });
              }}
            />
          )}
        />
      )}
    </div>
  );
};
