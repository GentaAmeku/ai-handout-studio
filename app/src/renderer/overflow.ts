// 描画後のはみ出し検査。事前の文字数制限ではなく、実寸で測る

// 文言は持たず、はみ出した量(px)だけを返す。訳は表示する側で引く(overflowMessage)

export type OverflowIssue = {
  blockId: string;
  type: "overflow";
  // 縦・横にはみ出した量。許容差以下なら 0
  overX: number;
  overY: number;
};

export type OverflowReport = {
  slideId: string;
  ok: boolean;
  issues: OverflowIssue[];
};

// 小数の丸めで出る 1px 以下の差は無視する
const TOLERANCE_PX = 1;

const beyondTolerance = (px: number): number => (px > TOLERANCE_PX ? px : 0);

const issueFor = (block: HTMLElement): OverflowIssue[] => {
  const overY = beyondTolerance(block.scrollHeight - block.clientHeight);
  const overX = beyondTolerance(block.scrollWidth - block.clientWidth);
  if (overY === 0 && overX === 0) return [];
  return [
    { blockId: block.dataset.blockId ?? "", type: "overflow", overX, overY },
  ];
};

export const inspectOverflow = (root: ParentNode): OverflowReport[] =>
  [...root.querySelectorAll<HTMLElement>("[data-slide-id]")].map((slide) => {
    const issues = [
      ...slide.querySelectorAll<HTMLElement>("[data-block-id]"),
    ].flatMap(issueFor);
    return {
      slideId: slide.dataset.slideId ?? "",
      ok: issues.length === 0,
      issues,
    };
  });
