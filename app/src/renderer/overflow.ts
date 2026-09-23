// 描画後のはみ出し検査。事前の文字数制限ではなく、実寸で測る

export type OverflowIssue = {
  blockId: string;
  type: "overflow";
  message: string;
};

export type OverflowReport = {
  slideId: string;
  ok: boolean;
  issues: OverflowIssue[];
};

// 小数の丸めで出る 1px 以下の差は無視する
const TOLERANCE_PX = 1;

const issueFor = (block: HTMLElement): OverflowIssue[] => {
  const overY = block.scrollHeight - block.clientHeight;
  const overX = block.scrollWidth - block.clientWidth;
  if (overY <= TOLERANCE_PX && overX <= TOLERANCE_PX) return [];
  return [
    {
      blockId: block.dataset.blockId ?? "",
      type: "overflow",
      message:
        overY > TOLERANCE_PX
          ? `本文が${overY}pxはみ出している`
          : `横に${overX}pxはみ出している`,
    },
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
