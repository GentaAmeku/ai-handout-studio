import "../editor/editor.css";
import "./design.css";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Star } from "lucide-react";
import {
  type CSSProperties,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  designTemplateQuery,
  designTemplateSampleQuery,
  designTemplatesQuery,
  useSaveDesignSelection,
} from "../../api/queries";
import type { DesignTemplatesDetail } from "../../api/types";
import { ScaledSlide } from "../../components/ScaledSlide";
import { editorSlides, sampleAssetBase } from "../../design/template-sample";
import { mergeTokens, minTextScale } from "../../design/theme";
import { type Language, useLanguage } from "../../i18n/language";
import type { Slide } from "../../schema/deck";
import {
  drawnSheetBase,
  type SheetLayout,
  type Surface,
  type Template,
  type SlideSample as TemplateSample,
  withTextScale,
} from "../../schema/design";
import { SideResizeHandle } from "../editor/SideResizeHandle";
import {
  readSideWidth,
  SIDE_WIDTH_MAX,
  SIDE_WIDTH_MIN,
  writeSideWidth,
} from "../editor/side-width";
import { templateListPath } from "../templates/paths";
import {
  CheckReport,
  type CheckResult,
  inspectFrameOverflow,
  SlideOverflowCheck,
} from "./DesignChecks";
import { partSlides } from "./parts";
import {
  documentPath,
  FrameSample,
  SlideSample,
  sheetPath,
  type Zoom,
  ZoomToggle,
} from "./SampleStage";
import { SkeletonPanel } from "./SkeletonPanel";
import { wireSheetToggle } from "./sheet-toggle";
import { TextScalePanel } from "./TextScalePanel";
import { type TemplateDraft, useTemplateDraft } from "./useTemplateDraft";

// テンプレートの編集。見本を画面の大部分に出し、右の欄は節を縦に並べて値を変える。
// 変えられるのはレイアウトと文字の大きさだけ。色・書体・余白・部品・名前と説明は AI に頼んでファイルを直す

// そのテンプレートの見本の全ページと、部品一覧の2枚。見本が無ければ共通の見本に落ちる
const sampleSlides = (
  sample: TemplateSample | null | undefined,
  lang: Language,
): Slide[] => [...editorSlides(sample, lang), ...partSlides(lang)];

const Thumbnails = ({
  slides,
  index,
  template,
  variables,
  assetBaseUrl,
  onSelect,
}: {
  slides: readonly Slide[];
  index: number;
  template: string;
  variables: Readonly<Record<string, string>>;
  assetBaseUrl: string;
  onSelect: (index: number) => void;
}) => {
  const { t } = useLanguage();
  return (
    <aside className="viewer__slides" aria-label={t("slides.list")}>
      <p className="viewer__slides-head">
        <span>{t("design.sample.pages")}</span>
        <span className="count-badge">
          {t("unit.slides", { n: slides.length })}
        </span>
      </p>
      <ol className="thumb-list">
        {slides.map((slide, position) => (
          <li key={slide.id} className="thumb">
            <span className="thumb__number">{position + 1}</span>
            <span className="thumb__frame">
              <ScaledSlide
                slide={slide}
                decorative
                context={{
                  pageNumber: position + 1,
                  pageCount: slides.length,
                  assetBaseUrl,
                  themeVariables: variables,
                  template,
                }}
              />
            </span>
            <button
              type="button"
              className="thumb__button"
              aria-label={t("slides.select", { n: position + 1 })}
              aria-current={position === index ? "true" : undefined}
              onClick={() => onSelect(position)}
            />
          </li>
        ))}
      </ol>
    </aside>
  );
};

// 右の欄の節。見出しと並びを共通にし、次の節を足しやすくする
const Section = ({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) => (
  <section className="prop-section">
    <h2 className="prop-section__title">{title}</h2>
    {children}
  </section>
);

const TemplateEditor = ({
  surface,
  detail,
  draft,
  sample,
  fromDeckId,
}: {
  surface: Surface;
  detail: DesignTemplatesDetail;
  draft: TemplateDraft;
  sample: TemplateSample | null | undefined;
  fromDeckId?: string;
}) => {
  const { t, lang } = useLanguage();
  const layout = surface === "slide" ? undefined : draft.template.layout;
  const [zoom, setZoom] = useState<Zoom>("fit");
  const [slideIndex, setSlideIndex] = useState(0);
  const [checks, setChecks] = useState<CheckResult>();
  const [checkRun, setCheckRun] = useState(0);
  const [sideWidth, setSideWidth] = useState(readSideWidth);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const saveSelection = useSaveDesignSelection();
  const slides = useMemo(() => sampleSlides(sample, lang), [sample, lang]);
  const assetBaseUrl = sampleAssetBase(draft.name, sample);
  const variables = draft.variables;
  // 質問票の見本は、骨格の元(base)で出す。overview は1問ずつと同じに描く
  const sheetBase = drawnSheetBase(
    surface === "sheet" && layout ? (layout as SheetLayout).base : "focus",
  );
  const section = t(`design.sample.${surface}`);
  const isDefault = detail.selection[surface] === draft.name;
  const slide = slides[slideIndex] ?? slides[0];
  // 文字の大きさの下限は、倍率を掛ける前の字の大きさと検査の最小の字で決める
  const minFontSize = draft.template.checks?.minFontSize;
  const textScaleMin = useMemo(
    () =>
      minTextScale(
        mergeTokens(detail.tokens, draft.template.tokens),
        minFontSize,
      ),
    [detail.tokens, draft.template.tokens, minFontSize],
  );

  // 節の並び。レイアウト(スライドは無し)と文字の大きさ(3区分とも)
  const sections: { key: string; title: string; node: ReactNode }[] = [
    ...(surface !== "slide" && layout
      ? [
          {
            key: "layout",
            title: t("design.section.layout"),
            node: (
              <SkeletonPanel
                surface={surface}
                layout={layout}
                onChange={(next) =>
                  draft.setTemplate({ ...draft.template, layout: next })
                }
              />
            ),
          },
        ]
      : []),
    {
      key: "textScale",
      title: t("design.section.textScale"),
      node: (
        <TextScalePanel
          value={draft.template.textScale ?? 1}
          min={textScaleMin}
          minFontSize={minFontSize}
          onChange={(scale) =>
            draft.setTemplate(withTextScale(draft.template, scale))
          }
        />
      ),
    },
  ];

  const handleSave = () =>
    draft.save(() => {
      // 質問票と文書は、いま出している見本の iframe を測る
      const overflow =
        surface === "slide"
          ? undefined
          : inspectFrameOverflow(frameRef.current, t("design.checks.frame"));
      setChecks({ overflow });
      setCheckRun((run) => run + 1);
    });

  return (
    <div className="design">
      <header className="design__bar">
        {fromDeckId ? (
          <Link
            to="/decks/$deckId"
            params={{ deckId: fromDeckId }}
            className="button button--ghost design__back"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
            {t("templates.backToDeck")}
          </Link>
        ) : (
          <Link
            to={templateListPath[surface]}
            className="button button--ghost design__back"
          >
            <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
            {t(`templates.title.${surface}`)}
          </Link>
        )}
        <h1 className="design__title">{draft.template.label}</h1>
        <button
          type="button"
          className="button button--secondary design__default"
          aria-pressed={isDefault}
          disabled={isDefault || saveSelection.isPending}
          onClick={() =>
            saveSelection.mutate({
              ...detail.selection,
              [surface]: draft.name,
            })
          }
        >
          <Star
            size={16}
            strokeWidth={1.75}
            aria-hidden
            fill={isDefault ? "currentColor" : "none"}
          />
          {t("templates.isDefault")}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!draft.canSave}
          onClick={handleSave}
        >
          {draft.saving ? t("design.saving") : t("design.save")}
        </button>
      </header>
      <div
        className="design__body"
        style={{ "--edit-side-width": `${sideWidth}px` } as CSSProperties}
      >
        <div
          className={`design__main design-surface design-surface--${surface}`}
        >
          {surface === "slide" && (
            <Thumbnails
              slides={slides}
              index={slideIndex}
              template={draft.name}
              variables={variables}
              assetBaseUrl={assetBaseUrl}
              onSelect={setSlideIndex}
            />
          )}
          <div className="design-surface__stage">
            <div className="design-surface__tools">
              <ZoomToggle zoom={zoom} onChange={setZoom} />
              {surface === "sheet" && (
                <span className="design-surface__meta">
                  {t(`design.layout.${sheetBase}`)}
                </span>
              )}
              {surface === "slide" && (
                <span className="design-surface__meta">
                  {t("design.sample.page", {
                    n: slideIndex + 1,
                    total: slides.length,
                  })}
                </span>
              )}
            </div>
            {surface === "slide" ? (
              slide && (
                <SlideSample
                  slide={slide}
                  zoom={zoom}
                  context={{
                    pageNumber: slideIndex + 1,
                    pageCount: slides.length,
                    assetBaseUrl,
                    themeVariables: variables,
                    template: draft.name,
                  }}
                />
              )
            ) : (
              <FrameSample
                path={
                  surface === "sheet"
                    ? sheetPath(sheetBase, lang)
                    : documentPath(lang)
                }
                template={draft.name}
                title={section}
                variables={variables}
                zoom={zoom}
                frameRef={frameRef}
                // 質問票の見本は「質問一覧を閉じる/開く」で一覧を開閉できる
                onFrameLoad={
                  surface === "sheet"
                    ? (frame) => wireSheetToggle(frame.contentDocument)
                    : undefined
                }
              />
            )}
          </div>
        </div>
        <aside
          className="side-panel design__side"
          aria-label={t("design.surfacePanel", { surface: section })}
        >
          <SideResizeHandle
            width={sideWidth}
            min={SIDE_WIDTH_MIN}
            max={SIDE_WIDTH_MAX}
            onChange={(width) => {
              setSideWidth(width);
              writeSideWidth(width);
            }}
          />
          <div className="side-panel__body">
            <div className="prop-panel">
              {checks && <CheckReport result={checks} />}
              {draft.error && (
                <p className="form-error" role="alert">
                  {draft.error}
                </p>
              )}
              {draft.saveError && (
                <p className="form-error" role="alert">
                  {draft.saveError}
                </p>
              )}
              {saveSelection.isError && (
                <p className="form-error" role="alert">
                  {saveSelection.error.message}
                </p>
              )}
              {sections.map((entry) => (
                <Section key={entry.key} title={entry.title}>
                  {entry.node}
                </Section>
              ))}
            </div>
          </div>
        </aside>
      </div>
      {surface === "slide" && checks && checks.overflow === undefined && (
        <SlideOverflowCheck
          key={checkRun}
          slides={slides}
          template={draft.name}
          variables={variables}
          assetBaseUrl={assetBaseUrl}
          onDone={(overflow) =>
            setChecks((current) => current && { ...current, overflow })
          }
        />
      )}
    </div>
  );
};

const TemplateDraftEditor = ({
  surface,
  name,
  detail,
  initial,
  fromDeckId,
}: {
  surface: Surface;
  name: string;
  detail: DesignTemplatesDetail;
  initial: Template;
  fromDeckId?: string;
}) => {
  const { lang } = useLanguage();
  const draft = useTemplateDraft({
    surface,
    name,
    initial,
    base: detail,
  });
  // 中身の見本はスライドだけが持つ。読めるまでと、持たないテンプレートは共通の見本で描く
  const sample = useQuery({
    ...designTemplateSampleQuery(surface, name, lang),
    enabled: surface === "slide",
  });
  return (
    <TemplateEditor
      surface={surface}
      detail={detail}
      draft={draft}
      sample={sample.data?.sample}
      fromDeckId={fromDeckId}
    />
  );
};

export const TemplateEditPage = ({
  surface,
  name,
  fromDeckId,
}: {
  surface: Surface;
  name: string;
  fromDeckId?: string;
}) => {
  const { t } = useLanguage();
  const templates = useQuery(designTemplatesQuery);
  const template = useQuery(designTemplateQuery(surface, name));

  if (templates.isPending || template.isPending) {
    return <p className="state-message">{t("common.loading")}</p>;
  }
  const error = templates.error ?? template.error;
  if (error || !templates.data || !template.data) {
    return (
      <div className="state-message state-message--error">
        <p>{error?.message ?? t("design.loadFail")}</p>
        <Link
          to={templateListPath[surface]}
          className="button button--secondary"
        >
          {t(`templates.title.${surface}`)}
        </Link>
      </div>
    );
  }
  return (
    <TemplateDraftEditor
      key={`${surface}/${name}`}
      surface={surface}
      name={name}
      detail={templates.data}
      initial={template.data.template}
      fromDeckId={fromDeckId}
    />
  );
};
