import type {
  ContentKind,
  ContentPlace,
  ContentSearchResult,
} from "../../src/api/types.ts";

// ai-handout-studio search の出力。エージェントが読む前提で、1件を3行(区分・ID・題名/場所/前後の文)にする

const KIND_LABEL: Record<ContentKind, string> = {
  slide: "スライド",
  sheet: "質問票",
  document: "HTML 資料",
};

export const placeLabel = (place: ContentPlace): string => {
  if (place.type === "overview") return "概要";
  if (place.type === "section") return place.heading;
  if (place.type === "question") return `Q${place.number}`;
  return `スライド ${place.number}`;
};

export const formatContentHits = (
  query: string,
  { hits, vector }: ContentSearchResult,
): string =>
  hits.length === 0
    ? `「${query}」の中身に当たる資料は見つからなかった`
    : [
        `「${query}」の中身の当たり ${hits.length} 件(近い順${vector ? "。ベクトル検索あり" : ""})`,
        ...hits.flatMap((hit, index) => [
          `${index + 1}. ${hit.id} ${KIND_LABEL[hit.kind]} ${hit.title}`,
          `   場所: ${placeLabel(hit.place)}`,
          `   ${hit.snippet.map((segment) => segment.text).join("")}`,
        ]),
      ].join("\n");
