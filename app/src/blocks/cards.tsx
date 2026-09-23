import { BlockIcon } from "./icons";
import type { BlockProps } from "./types";

export const CardGridBlock = ({ block }: BlockProps<"card-grid">) => (
  <div
    className="ds-card-grid"
    style={{
      gridTemplateColumns: `repeat(${block.props.columns}, minmax(0, 1fr))`,
    }}
  >
    {block.props.items.map((item, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: 項目は id を持たず、並び順で区別する
      <div key={index} className="ds-card">
        <div className="ds-card__head">
          <BlockIcon name={item.icon} size={28} />
          <p className="ds-card__title">{item.title}</p>
        </div>
        <p className="ds-card__body">{item.body}</p>
        <span className="ds-card__tail" />
      </div>
    ))}
  </div>
);

export const KpiRowBlock = ({ block }: BlockProps<"kpi-row">) => (
  <div className="ds-kpi-row">
    {block.props.items.map((item, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: 項目は id を持たず、並び順で区別する
      <div key={index} className="ds-kpi">
        <p className="ds-kpi__value">{item.value}</p>
        <p className="ds-kpi__label">{item.label}</p>
        {item.note && <p className="ds-kpi__note">{item.note}</p>}
      </div>
    ))}
  </div>
);

const Column = ({ title, body }: { title?: string; body: string }) => (
  <div className="ds-two-col__column">
    {title && <p className="ds-two-col__title">{title}</p>}
    <p className="ds-two-col__body">{body}</p>
  </div>
);

export const TwoColBlock = ({ block }: BlockProps<"two-col">) => (
  <div className="ds-two-col">
    <Column {...block.props.left} />
    <Column {...block.props.right} />
  </div>
);

export const ProcessBlock = ({ block }: BlockProps<"process">) => (
  <ol className="ds-process">
    {block.props.steps.map((step, index) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: 手順は id を持たず、並び順が意味を持つ
      <li key={index} className="ds-process__step">
        <span className="ds-process__number">{index + 1}</span>
        <p className="ds-process__title">{step.title}</p>
        <p className="ds-process__body">{step.body}</p>
        {index < block.props.steps.length - 1 && (
          <span className="ds-process__link" aria-hidden="true" />
        )}
      </li>
    ))}
  </ol>
);
