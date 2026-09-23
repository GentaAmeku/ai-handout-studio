import type { RenderContext } from "../renderer/context";
import { type Block, isKnownBlock, type KnownBlockType } from "../schema/block";
import { CardGridBlock, KpiRowBlock, ProcessBlock, TwoColBlock } from "./cards";
import { FooterBlock, ImageBlock, TableBlock } from "./media";
import { BulletsBlock, HeadingBlock, TextBlock } from "./text";
import type { BlockComponent } from "./types";

const registry: { [T in KnownBlockType]: BlockComponent<T> } = {
  heading: HeadingBlock,
  text: TextBlock,
  bullets: BulletsBlock,
  "card-grid": CardGridBlock,
  "kpi-row": KpiRowBlock,
  "two-col": TwoColBlock,
  process: ProcessBlock,
  table: TableBlock,
  image: ImageBlock,
  footer: FooterBlock,
};

const UnknownBlock = ({ type }: { type: string }) => (
  <div className="ds-unknown">未対応のブロック: {type}</div>
);

export const BlockContent = ({
  block,
  context,
}: {
  block: Block;
  context: RenderContext;
}) => {
  if (!isKnownBlock(block)) return <UnknownBlock type={block.type} />;
  // type と props の組はスキーマで保証済み。対応表の引き当てだけ型を広げる
  const Component = registry[block.type] as BlockComponent<KnownBlockType>;
  return <Component block={block} context={context} />;
};
