import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OpenFullLink } from "./OpenFullLink";

// 原寸で開く。質問票と HTML 資料の帯に置き、1枚の HTML を別のタブで開く

afterEach(() => {
  cleanup();
});

describe("OpenFullLink", () => {
  it.each([
    ["document", "doc_20260925_001", "/api/documents/doc_20260925_001/preview"],
    ["sheet", "sheet_20260925_001", "/api/sheets/sheet_20260925_001/preview"],
  ] as const)("%s は原寸のページを別のタブで開く", (kind, id, href) => {
    render(<OpenFullLink kind={kind} id={id} />);
    const link = screen.getByRole("link", { name: "原寸で開く" });
    expect(link.getAttribute("href")).toBe(href);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
    // 名前はマウスを重ねるか選んだときの吹き出しに出す。title は使わない
    expect(link.dataset.tooltip).toBe("原寸で開く");
    expect(link.hasAttribute("title")).toBe(false);
  });
});
