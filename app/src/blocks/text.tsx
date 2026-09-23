import type { BlockProps } from "./types";

export const HeadingBlock = ({ block }: BlockProps<"heading">) => {
  const { kicker, text, level } = block.props;
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <div className="ds-heading" data-level={level}>
      {kicker && <p className="ds-heading__kicker">{kicker}</p>}
      <Tag className="ds-heading__text">{text}</Tag>
    </div>
  );
};

export const TextBlock = ({ block }: BlockProps<"text">) => (
  <p className="ds-text" style={{ textAlign: block.props.align ?? "left" }}>
    {block.props.text}
  </p>
);

export const BulletsBlock = ({ block }: BlockProps<"bullets">) => {
  const { items, marker = "disc" } = block.props;
  const List = marker === "number" ? "ol" : "ul";
  return (
    <List className={`ds-bullets ds-bullets--${marker}`}>
      {items.map((item, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 項目は id を持たず、並び順で区別する
        <li key={index} className="ds-bullets__item">
          {item}
        </li>
      ))}
    </List>
  );
};
