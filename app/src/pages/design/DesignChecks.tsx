import { useEffect, useEffectEvent, useRef } from "react";
import { useLanguage } from "../../i18n/language";
import { inspectOverflow } from "../../renderer/overflow";
import { SlideView } from "../../renderer/SlideView";
import type { Slide } from "../../schema/deck";

// 保存時の検査。その面の見本のはみ出しを見る(明暗差の検査は 106 で外した。
// 画面で変えられるのはレイアウトと文字の大きさだけで、色は変わらないため)

export type OverflowIssue = { where: string; message: string };

export type CheckResult = {
  overflow?: OverflowIssue[];
};

// スライド: 見本の資料と部品一覧を画面の外に等倍で描き、はみ出しを測る
export const SlideOverflowCheck = ({
  slides,
  template,
  variables,
  assetBaseUrl,
  onDone,
}: {
  slides: readonly Slide[];
  // 専用の CSS を当てて測る
  template: string;
  variables: Readonly<Record<string, string>>;
  assetBaseUrl: string;
  onDone: (issues: OverflowIssue[]) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const report = useEffectEvent((issues: OverflowIssue[]) => onDone(issues));

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const state = { cancelled: false };
    const measure = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await document.fonts.ready;
      if (state.cancelled) return;
      report(
        inspectOverflow(root).flatMap((slide) =>
          slide.issues.map((issue) => ({
            where: `${slide.slideId} / ${issue.blockId}`,
            message: issue.message,
          })),
        ),
      );
    };
    void measure();
    return () => {
      state.cancelled = true;
    };
  }, []);

  return (
    <div ref={ref} className="overflow-probe" aria-hidden="true">
      {slides.map((slide, index) => (
        <SlideView
          key={slide.id}
          slide={slide}
          context={{
            pageNumber: index + 1,
            pageCount: slides.length,
            assetBaseUrl,
            themeVariables: variables,
            template,
          }}
        />
      ))}
    </div>
  );
};

const describe = (element: Element): string =>
  [
    element.tagName.toLowerCase(),
    ...[...element.classList].slice(0, 2).map((name) => `.${name}`),
  ].join("");

const clips = (element: Element): boolean => {
  const view = element.ownerDocument.defaultView;
  const overflowX = view?.getComputedStyle(element).overflowX ?? "visible";
  return overflowX !== "visible";
};

// 質問票と文書: iframe の画面の幅から右へはみ出す要素を探す。
// 横にスクロールさせる枠(overflow-x が visible 以外)の中身と、はみ出した要素の子は数えない
export const inspectFrameOverflow = (
  frame: HTMLIFrameElement | null,
  message: string,
): OverflowIssue[] => {
  const doc = frame?.contentDocument;
  if (!doc?.body) return [];
  const limit = doc.documentElement.clientWidth + 1;
  const elements = [...doc.body.querySelectorAll("*")];
  const overflowing = new Set(
    elements.filter((element) => element.getBoundingClientRect().right > limit),
  );
  const insideClip = (element: Element): boolean => {
    const parent = element.parentElement;
    return parent !== null && parent !== doc.body
      ? clips(parent) || insideClip(parent)
      : false;
  };
  return [...overflowing]
    .filter(
      (element) =>
        !(element.parentElement && overflowing.has(element.parentElement)) &&
        !insideClip(element),
    )
    .map((element) => ({ where: describe(element), message }));
};

export const CheckReport = ({ result }: { result: CheckResult }) => {
  const { t } = useLanguage();
  return (
    <section className="design-checks" aria-live="polite">
      <h2 className="prop-section__title">{t("design.checks")}</h2>
      <div className="design-checks__row">
        <h3 className="design-subtitle">{t("design.checks.overflow")}</h3>
        {result.overflow === undefined ? (
          <p className="prop-field__hint">{t("design.checks.measuring")}</p>
        ) : result.overflow.length === 0 ? (
          <p className="design-checks__ok">{t("design.checks.overflowOk")}</p>
        ) : (
          <ul className="design-checks__list">
            {result.overflow.map((issue) => (
              <li key={`${issue.where}-${issue.message}`}>
                <code>{issue.where}</code>: {issue.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};
