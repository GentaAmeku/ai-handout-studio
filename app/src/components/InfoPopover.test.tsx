import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InfoPopover } from "./InfoPopover";

// 上の帯の ⓘ。押すと欄が開いて値を出し、外を押すか Esc で閉じる

afterEach(cleanup);

const rows = [
  { label: "ID", value: "sheet_20260921_001" },
  { label: "作成日時", value: "2026/09/21 09:00" },
];

describe("InfoPopover", () => {
  it("ふだんは欄を出さず、押すと開いて行の値が見える", () => {
    render(<InfoPopover label="資料の情報" rows={rows} />);
    expect(screen.queryByText("sheet_20260921_001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "資料の情報" }));
    expect(screen.getByText("sheet_20260921_001")).toBeTruthy();
    expect(screen.getByText("2026/09/21 09:00")).toBeTruthy();
  });

  it("Esc で閉じる", () => {
    render(<InfoPopover label="資料の情報" rows={rows} />);
    fireEvent.click(screen.getByRole("button", { name: "資料の情報" }));
    expect(screen.getByText("ID")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("ID")).toBeNull();
  });

  it("外を押すと閉じる", () => {
    render(
      <div>
        <InfoPopover label="資料の情報" rows={rows} />
        <button type="button">外</button>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: "資料の情報" }));
    expect(screen.getByText("ID")).toBeTruthy();
    fireEvent.pointerDown(screen.getByRole("button", { name: "外" }));
    expect(screen.queryByText("ID")).toBeNull();
  });
});
