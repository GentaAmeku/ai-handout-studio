import { useEffect, useEffectEvent, useRef } from "react";
import { deckAssetBase } from "../../api/client";
import { inspectOverflow, type OverflowReport } from "../../renderer/overflow";
import { SlideView } from "../../renderer/SlideView";
import { type Deck, deckTemplate } from "../../schema/deck";

// 画面の外に全スライドを等倍で描いて、はみ出しを実寸で測る
export const OverflowProbe = ({
  deck,
  deckId,
  onDone,
}: {
  deck: Deck;
  deckId: string;
  onDone: (reports: OverflowReport[]) => void;
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const report = useEffectEvent((reports: OverflowReport[]) => onDone(reports));

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const state = { cancelled: false };
    const measure = async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await document.fonts.ready;
      if (state.cancelled) return;
      report(inspectOverflow(root).filter((slide) => !slide.ok));
    };
    void measure();
    return () => {
      state.cancelled = true;
    };
  }, []);

  return (
    <div ref={ref} className="overflow-probe" aria-hidden="true">
      {deck.slides.map((slide, index) => (
        <SlideView
          key={slide.id}
          slide={slide}
          context={{
            pageNumber: index + 1,
            pageCount: deck.slides.length,
            assetBaseUrl: deckAssetBase(deckId),
            template: deckTemplate(deck),
          }}
        />
      ))}
    </div>
  );
};
