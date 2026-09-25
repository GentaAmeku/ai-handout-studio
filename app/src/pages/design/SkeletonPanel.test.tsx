import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SkeletonPanel } from "./SkeletonPanel";

afterEach(cleanup);

// テンプレートの編集の「レイアウト」。用意した並びに無い骨格は「今の並び」の縮図で見せる
describe("文書の骨格の縮図", () => {
  it("3列の骨格を、列の幅の比と領域ごとの箱で描く", () => {
    render(
      <SkeletonPanel
        surface="document"
        layout={{
          columns: [232, 720, 216],
          areas: [["toc", "main", "aside"]],
          head: "main",
        }}
        onChange={() => undefined}
      />,
    );
    const current = screen.getByRole("radio", { name: "今の並び" });
    expect((current as HTMLInputElement).checked).toBe(true);
    const mini = current
      .closest(".skeleton-card")
      ?.querySelector<HTMLElement>(".skeleton-doc");
    expect(mini?.style.gridTemplateColumns).toBe("232fr 720fr 216fr");
    expect(
      Array.from(
        mini?.querySelectorAll<HTMLElement>(".skeleton-doc__area") ?? [],
      ).map((box) => [box.textContent, box.style.gridColumn]),
    ).toEqual([
      ["目次", "1 / 2"],
      ["本文", "2 / 3"],
      ["脇", "3 / 4"],
    ]);
  });
});
