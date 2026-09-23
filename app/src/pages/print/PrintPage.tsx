import "./print.css";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { deckAssetBase } from "../../api/client";
import { deckQuery, profileQuery } from "../../api/queries";
import { inspectOverflow, type OverflowReport } from "../../renderer/overflow";
import { SlideView } from "../../renderer/SlideView";
import { type Deck, deckTemplate } from "../../schema/deck";

const route = getRouteApi("/print/$deckId");

const nextFrame = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

// 描画が済んでからフォントと画像の読み込みを待つ。撮る側は data-print-ready を待つ
const waitForAssets = async (root: HTMLElement): Promise<void> => {
  await nextFrame();
  await document.fonts.ready;
  await Promise.all(
    [...root.querySelectorAll("img")].map((image) =>
      image.decode().catch(() => undefined),
    ),
  );
  await nextFrame();
};

const PrintDeck = ({ deckId, deck }: { deckId: string; deck: Deck }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState<OverflowReport[] | null>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const state = { cancelled: false };
    void waitForAssets(root).then(() => {
      if (state.cancelled) return;
      setOverflow(inspectOverflow(root).filter((report) => !report.ok));
    });
    return () => {
      state.cancelled = true;
    };
  }, []);

  return (
    <div
      ref={ref}
      className="print-root"
      data-print-root
      data-print-ready={overflow ? "true" : undefined}
      data-overflow={overflow ? JSON.stringify(overflow) : undefined}
    >
      {deck.slides.map((slide, index) => (
        <div key={slide.id} className="print-page">
          <SlideView
            slide={slide}
            context={{
              pageNumber: index + 1,
              pageCount: deck.slides.length,
              assetBaseUrl: deckAssetBase(deckId),
              template: deckTemplate(deck),
            }}
          />
        </div>
      ))}
    </div>
  );
};

const PrintError = ({ message }: { message: string }) => (
  <pre data-print-error={message}>{message}</pre>
);

export const PrintPage = () => {
  const { deckId } = route.useParams();
  const detail = useQuery(deckQuery(deckId));
  // プロフィール(組織名)が届く前に「準備完了」を立てないよう、揃うまで描かない
  const profile = useQuery(profileQuery);
  if (detail.isPending || profile.isPending) return null;
  if (detail.isError) return <PrintError message={detail.error.message} />;
  if (detail.data.state === "invalid") {
    return <PrintError message={detail.data.message} />;
  }
  return <PrintDeck deckId={deckId} deck={detail.data.deck} />;
};
