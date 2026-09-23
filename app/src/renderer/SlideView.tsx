import type { CSSProperties } from "react";
import { BlockContent } from "../blocks/registry";
import { resolveTemplateName, templateStyle } from "../design/registry";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../schema/deck";
import { type RenderContext, withProfile } from "./context";
import { SlideDecoration } from "./decoration";
import { useProfileValue } from "./profile-context";

// 見た目の CSS(design/dist)はアプリの入口が読む。ここはテーマの変数だけを当てる
const slideStyle = (context: RenderContext): CSSProperties => ({
  width: SLIDE_WIDTH,
  height: SLIDE_HEIGHT,
  ...(context.themeVariables
    ? (context.themeVariables as CSSProperties)
    : templateStyle(resolveTemplateName(context.template))),
});

// 専用の CSS(.ds-slide[data-template="<名前>"])を当てる名前。
// 編集中の値を渡すときは、呼び出し側が渡した名前をそのまま使う(無ければ当てない)
const templateOf = (context: RenderContext): string | undefined =>
  context.themeVariables
    ? context.template
    : resolveTemplateName(context.template);

const showsOrgName = (layout: Slide["layout"]): boolean =>
  layout === "cover" || layout === "closing";

// 編集プレビューと書き出しで同じものを使う。縮小は呼び出し側で行う
export const SlideView = ({
  slide,
  context,
}: {
  slide: Slide;
  context: RenderContext;
}) => {
  const rendered = withProfile(context, useProfileValue());
  return (
    <div
      className={`ds-slide ds-slide--${slide.layout}`}
      data-slide-id={slide.id}
      data-template={templateOf(rendered)}
      style={slideStyle(rendered)}
    >
      <SlideDecoration layout={slide.layout} />
      {rendered.orgName && showsOrgName(slide.layout) && (
        <p className="ds-org">{rendered.orgName}</p>
      )}
      {slide.blocks.map((block) => (
        <div
          key={block.id}
          className={`ds-block ds-block--${block.type}`}
          data-block-id={block.id}
          data-block-type={block.type}
          style={{
            left: block.x,
            top: block.y,
            width: block.w,
            height: block.h,
          }}
        >
          <BlockContent block={block} context={rendered} />
        </div>
      ))}
    </div>
  );
};
