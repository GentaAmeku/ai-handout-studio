import { type Block, isKnownBlock } from "../schema/block";

// キャンバス上で文言をその場で直せるブロック(heading・text・bullets)の読み書き

export const inlineTextOf = (block: Block): string | undefined => {
  if (!isKnownBlock(block)) return undefined;
  if (block.type === "heading" || block.type === "text") {
    return block.props.text;
  }
  if (block.type === "bullets") return block.props.items.join("\n");
  return undefined;
};

// 箇条書きは1行を1項目にし、空の行は項目にしない
export const withInlineText = (block: Block, text: string): Block => {
  if (!isKnownBlock(block)) return block;
  if (block.type === "heading") {
    return { ...block, props: { ...block.props, text } };
  }
  if (block.type === "text") {
    return { ...block, props: { ...block.props, text } };
  }
  if (block.type === "bullets") {
    const items = text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line !== "");
    return { ...block, props: { ...block.props, items } };
  }
  return block;
};
