import { useState } from "react";
import { resolveAsset } from "../renderer/context";
import type { BlockProps } from "./types";

export const TableBlock = ({ block }: BlockProps<"table">) => (
  <table className="ds-table">
    <thead>
      <tr>
        {block.props.headers.map((header, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 列は id を持たず、並び順で区別する
          <th key={index}>{header}</th>
        ))}
      </tr>
    </thead>
    <tbody>
      {block.props.rows.map((row, rowIndex) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: 行は id を持たず、並び順で区別する
        <tr key={rowIndex}>
          {row.map((cell, cellIndex) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 列は id を持たず、並び順で区別する
            <td key={cellIndex}>{cell}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);

export const ImageBlock = ({ block, context }: BlockProps<"image">) => {
  const { src, fit = "cover", caption } = block.props;
  const [failed, setFailed] = useState(false);
  return (
    <figure className="ds-image">
      <div className="ds-image__frame">
        {failed ? (
          <p className="ds-image__missing">画像を読み込めない: {src}</p>
        ) : (
          <img
            className="ds-image__img"
            src={resolveAsset(context.assetBaseUrl, src)}
            alt={caption ?? ""}
            style={{ objectFit: fit }}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {caption && (
        <figcaption className="ds-image__caption">{caption}</figcaption>
      )}
    </figure>
  );
};

// ページ番号は Renderer から受け取る
export const FooterBlock = ({ block, context }: BlockProps<"footer">) => {
  const { showPage = true } = block.props;
  return (
    <div className="ds-footer">
      {showPage && (
        <span className="ds-footer__page">{context.pageNumber}</span>
      )}
    </div>
  );
};
