import type { RenderContext } from "../renderer/context";
import { SlideView } from "../renderer/SlideView";
import { SLIDE_HEIGHT, SLIDE_WIDTH, type Slide } from "../schema/deck";
import { useElementSize } from "./useElementSize";

type Fit = "width" | "contain";

const scaleFor = (fit: Fit, width: number, height: number): number =>
  fit === "width"
    ? width / SLIDE_WIDTH
    : Math.min(width / SLIDE_WIDTH, height / SLIDE_HEIGHT);

// 1280x720 のスライドを、描画はそのままに縮小して見せる
export const ScaledSlide = ({
  slide,
  context,
  fit = "width",
  decorative = false,
}: {
  slide: Slide;
  context: RenderContext;
  fit?: Fit;
  decorative?: boolean;
}) => {
  const { ref, width, height } = useElementSize<HTMLDivElement>();
  const scale = scaleFor(fit, width, height);
  return (
    <div
      ref={ref}
      className={`scaled-slide scaled-slide--${fit}`}
      aria-hidden={decorative || undefined}
    >
      {scale > 0 && (
        <div
          className="scaled-slide__frame"
          style={{ width: SLIDE_WIDTH * scale, height: SLIDE_HEIGHT * scale }}
        >
          <div
            className="scaled-slide__scaler"
            style={{ transform: `scale(${scale})` }}
          >
            <SlideView slide={slide} context={context} />
          </div>
        </div>
      )}
    </div>
  );
};
