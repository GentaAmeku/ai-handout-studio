import { type RefObject, useEffect, useRef, useState } from "react";
import { useElementSize } from "../../components/useElementSize";
import { useLanguage } from "../../i18n/language";
import type { RenderContext } from "../../renderer/context";
import { SlideView } from "../../renderer/SlideView";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../../schema/deck";

// 見本を大きく出す舞台。スライドはそのまま、質問票と文書は iframe で描き、倍率を選べる

export const ZOOMS = ["fit", "actual", "zoom"] as const;
export type Zoom = (typeof ZOOMS)[number];

// 拡大は細部(罫線・角丸・字の太さ)を見るための 2 倍
const FIXED_SCALE = { actual: 1, zoom: 2 } as const;

type Variables = Readonly<Record<string, string>>;

// 質問票と文書は、実際に開かれる画面の幅で描く
export const FRAME_WIDTH = 1280;

// 見本の HTML は design/samples/ にある。pnpm design:build が作る
export const sampleUrl = (path: string): string => `/api/design/files/${path}`;

export const SHEET_LAYOUTS = ["focus", "overview", "all", "print"] as const;
export type SheetLayout = (typeof SHEET_LAYOUTS)[number];
export const sheetPath = (layout: SheetLayout): string =>
  `samples/sheet.${layout}.html`;
export const DOCUMENT_PATH = "samples/document.html";

// iframe は同じオリジン。読み込み後と値の変更ごとに、文書の :root へ変数を書く。
// 前に書いて今は無い変数は消す(倍率を 100% に戻すと --text-scale が無くなる。残すと図だけ大きいままになる)
const applyVariables = (
  frame: HTMLIFrameElement | null,
  variables: Variables,
) => {
  const root = frame?.contentDocument?.documentElement;
  if (!root) return;
  const stale = Array.from(root.style).filter(
    (name) => name.startsWith("--") && !Object.hasOwn(variables, name),
  );
  for (const name of stale) {
    root.style.removeProperty(name);
  }
  for (const [name, value] of Object.entries(variables)) {
    root.style.setProperty(name, value);
  }
};

// 調整パネルで触れている値を使う場所を囲む。色は見本のテーマの警告の色を借りる
const HIGHLIGHT_ID = "design-highlight";
// 見本は縮めて出すので、線の太さを倍率で割り、画面の上で 3px に見せる
const highlightStyle = (scale: number): string => {
  const width = Math.max(1, Math.round((3 / scale) * 10) / 10);
  return `outline: ${width}px solid var(--color-danger) !important; outline-offset: ${width / 2}px !important;`;
};

// 規則ごとに分けて書く。1つが読めないセレクタでも、ほかの規則は効く
export const highlightCss = (
  selectors: readonly string[],
  scale: number,
  scope = "",
): string =>
  selectors
    .map((selector) => `${scope}${selector} { ${highlightStyle(scale)} }`)
    .join("\n");

const applyHighlight = (
  frame: HTMLIFrameElement | null,
  selectors: readonly string[],
  scale: number,
) => {
  const doc = frame?.contentDocument;
  if (!doc?.head) return;
  const existing = doc.getElementById(HIGHLIGHT_ID);
  const style = existing ?? doc.createElement("style");
  style.id = HIGHLIGHT_ID;
  style.textContent = highlightCss(selectors, scale);
  if (!existing) doc.head.append(style);
};

const NO_HIGHLIGHT: readonly string[] = [];
const NO_VARIABLES: Variables = {};

type FrameState = "checking" | "ready" | "missing";

const useSampleState = (src: string): FrameState => {
  const [state, setState] = useState<FrameState>("checking");
  useEffect(() => {
    const controller = new AbortController();
    setState("checking");
    fetch(src, { method: "HEAD", signal: controller.signal })
      .then((response) => setState(response.ok ? "ready" : "missing"))
      .catch(() => {
        if (!controller.signal.aborted) setState("missing");
      });
    return () => controller.abort();
  }, [src]);
  return state;
};

const scaleFor = (zoom: Zoom, fit: number): number =>
  zoom === "fit" ? fit : FIXED_SCALE[zoom];

// テンプレートの名前を渡すと、既定の写しの代わりにそのテンプレートの CSS(専用の CSS を含む)で描く
const frameSrc = (path: string, template: string | undefined): string =>
  template === undefined
    ? sampleUrl(path)
    : `${sampleUrl(path)}?template=${encodeURIComponent(template)}`;

// 同じオリジンの HTML を縮めて出す枠。見本(design/samples/)にも、
// 保存した質問票と HTML 資料の見本(/api/sheets/<id>/preview)にも使う
export const FrameView = ({
  src,
  title,
  variables = NO_VARIABLES,
  zoom = "fit",
  decorative = false,
  interactive = false,
  frameRef,
  highlight = NO_HIGHLIGHT,
  onFrameLoad,
  fitWidth = false,
}: {
  src: string;
  title: string;
  variables?: Variables;
  zoom?: Zoom;
  // 囲む要素のセレクタ
  highlight?: readonly string[];
  // 中のスクリプトを動かす(質問票の見本)。中身の CSP は指紋の合う
  // スクリプトだけを許す
  interactive?: boolean;
  // 入口のカードの見本。押せず、読み上げもしない
  decorative?: boolean;
  frameRef?: RefObject<HTMLIFrameElement | null>;
  // 中身を読み込んだあとに呼ぶ(編集画面の質問票の見本で一覧を開閉する)
  onFrameLoad?: (frame: HTMLIFrameElement) => void;
  // 「画面に合わせる」で縮めずに、枠の幅そのままで等倍に描く(質問票の1件のページ)。
  // 既定は実際の画面の幅(FRAME_WIDTH)で描いて枠に縮める
  fitWidth?: boolean;
}) => {
  const { t } = useLanguage();
  const state = useSampleState(src);
  const ownRef = useRef<HTMLIFrameElement>(null);
  const ref = frameRef ?? ownRef;
  const { ref: stageRef, width, height } = useElementSize<HTMLDivElement>();
  const fillsWidth = fitWidth && zoom === "fit";
  const frameWidth = fillsWidth ? width : FRAME_WIDTH;
  // 枠の幅で描くときは等倍(幅がまだ測れていない 0 のときは描かない)
  const scale = fillsWidth
    ? Math.sign(width)
    : scaleFor(zoom, width / FRAME_WIDTH);

  useEffect(() => {
    applyVariables(ref.current, variables);
  }, [ref, variables]);

  useEffect(() => {
    applyHighlight(ref.current, highlight, scale);
  }, [ref, highlight, scale]);

  if (state !== "ready") {
    return (
      <div className="design-stage design-stage--empty">
        {state === "checking"
          ? t("common.loading")
          : t("design.sample.pending")}
      </div>
    );
  }
  // 見える高さいっぱいに枠を取り、中身は iframe の中でスクロールする
  const frameHeight = scale > 0 ? height / scale : 0;
  return (
    <div
      ref={stageRef}
      className={`design-stage design-stage--frame design-stage--${zoom}`}
      aria-hidden={decorative || undefined}
    >
      {scale > 0 && (
        <div
          className="design-stage__box"
          style={{ width: frameWidth * scale, height: frameHeight * scale }}
        >
          <iframe
            ref={ref}
            className="design-stage__frame"
            src={src}
            title={title}
            sandbox={
              interactive
                ? "allow-same-origin allow-scripts"
                : "allow-same-origin"
            }
            tabIndex={decorative ? -1 : undefined}
            style={{
              width: frameWidth,
              height: frameHeight,
              transform: `scale(${scale})`,
            }}
            onLoad={(event) => {
              applyVariables(event.currentTarget, variables);
              applyHighlight(event.currentTarget, highlight, scale);
              onFrameLoad?.(event.currentTarget);
            }}
          />
        </div>
      )}
    </div>
  );
};

// design/samples/ の見本。テンプレートを渡すと、そのテンプレートの CSS で描く
export const FrameSample = ({
  path,
  template,
  ...rest
}: {
  path: string;
  template?: string;
  title: string;
  variables: Variables;
  zoom?: Zoom;
  highlight?: readonly string[];
  decorative?: boolean;
  frameRef?: RefObject<HTMLIFrameElement | null>;
  onFrameLoad?: (frame: HTMLIFrameElement) => void;
}) => <FrameView src={frameSrc(path, template)} {...rest} />;

// スライドの見本の囲みは、この属性を持つ要素の中だけに効かせる
export const HIGHLIGHT_SCOPE = "[data-design-highlight] ";

export const SlideSample = ({
  slide,
  context,
  zoom = "fit",
  highlight = NO_HIGHLIGHT,
}: {
  slide: Slide;
  context: RenderContext;
  zoom?: Zoom;
  highlight?: readonly string[];
}) => {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const scale = scaleFor(
    zoom,
    Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT),
  );
  return (
    <div
      ref={ref}
      className={`design-stage design-stage--slide design-stage--${zoom}`}
      data-design-highlight
    >
      {highlight.length > 0 && (
        <style>{highlightCss(highlight, scale || 1, HIGHLIGHT_SCOPE)}</style>
      )}
      {scale > 0 && (
        <div
          className="design-stage__box design-stage__box--slide"
          style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
        >
          <div
            className="design-stage__scaler"
            style={{ transform: `scale(${scale})` }}
          >
            <SlideView slide={slide} context={context} />
          </div>
        </div>
      )}
    </div>
  );
};

export const ZoomToggle = ({
  zoom,
  onChange,
}: {
  zoom: Zoom;
  onChange: (zoom: Zoom) => void;
}) => {
  const { t } = useLanguage();
  return (
    <fieldset className="zoom-toggle">
      <legend className="visually-hidden">{t("design.zoom")}</legend>
      {ZOOMS.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={zoom === item}
          onClick={() => onChange(item)}
        >
          {t(`design.zoom.${item}`)}
        </button>
      ))}
    </fieldset>
  );
};
