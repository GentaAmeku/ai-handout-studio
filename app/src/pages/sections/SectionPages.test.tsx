import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { HandoutSummary } from "../../api/types";
import { HandoutMetaRow } from "./SectionPages";

// 質問票の1件のページの下の1行(カードから外した ID・問数・回答・作成日時・更新日時)

afterEach(cleanup);

const sheet = (overrides: Partial<HandoutSummary> = {}): HandoutSummary => ({
  kind: "sheet",
  id: "sheet_20260921_001",
  title: "見本",
  template: "cobalt",
  createdAt: "2026-09-21T00:30:00.000Z",
  updatedAt: "2026-09-21T09:05:00.000Z",
  questionCount: 3,
  hasAnswers: false,
  ...overrides,
});

describe("HandoutMetaRow", () => {
  it("ID・問数・作成日時・更新日時を、時刻まで出す", () => {
    render(<HandoutMetaRow handout={sheet()} />);
    expect(screen.getByText("sheet_20260921_001")).toBeTruthy();
    expect(screen.getByText("3 問")).toBeTruthy();
    expect(screen.getByText("回答なし")).toBeTruthy();
    expect(screen.getByText("2026/09/21 09:30")).toBeTruthy();
    expect(screen.getByText("2026/09/21 18:05")).toBeTruthy();
  });

  it("回答があれば「回答あり」を出す", () => {
    render(<HandoutMetaRow handout={sheet({ hasAnswers: true })} />);
    expect(screen.getByText("回答あり")).toBeTruthy();
  });

  it("問数が無ければ問数と回答の行を出さない", () => {
    render(
      <HandoutMetaRow
        handout={sheet({ questionCount: undefined, hasAnswers: undefined })}
      />,
    );
    expect(screen.queryByText(/問$/)).toBeNull();
    expect(screen.queryByText(/回答/)).toBeNull();
  });
});
