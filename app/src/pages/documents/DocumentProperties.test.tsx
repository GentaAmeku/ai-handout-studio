import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findBlock, findSection } from "../../editor/document-operations";
import type {
  DocumentEditorAction,
  DocumentSelection,
} from "../../editor/document-state";
import type { DocumentFile } from "../../schema/document";
import { DocumentProperties } from "./DocumentProperties";

// 受入確認の中身(文を直す・表の行を足す・注意の種類と札を変える・カードを2枚から3枚に)を、
// 右の欄の側から確かめる

const document = (): DocumentFile => ({
  id: "doc_20260920_001",
  title: "見本",
  status: "draft",
  meta: {
    createdAt: "2026-09-20T00:00:00.000Z",
    updatedAt: "2026-09-20T00:00:00.000Z",
  },
  head: { title: "見本", lede: "要旨" },
  toc: "auto",
  sections: [
    {
      id: "s01",
      heading: "いま何が起きているか",
      blocks: [
        { id: "b01", type: "text", props: { text: "本文" } },
        {
          id: "b02",
          type: "table",
          props: { headers: ["項目", "内容"], rows: [["ア", "イ"]] },
        },
        {
          id: "b03",
          type: "notice",
          props: { kind: "warning", label: "注意", text: "条件" },
        },
        {
          id: "b04",
          type: "cards",
          props: {
            columns: 2,
            items: [
              { title: "1", body: "本文" },
              { title: "2", body: "本文" },
            ],
          },
        },
      ],
    },
  ],
});

afterEach(cleanup);

const renderPanel = (selection: DocumentSelection) => {
  const onEdit = vi.fn<(action: DocumentEditorAction) => void>();
  render(
    <DocumentProperties
      document={document()}
      selection={selection}
      onEdit={onEdit}
    />,
  );
  return onEdit;
};

const edited = (onEdit: ReturnType<typeof renderPanel>): DocumentFile => {
  const action = onEdit.mock.calls.at(-1)?.[0];
  if (action?.type !== "edit") throw new Error("編集が起きていない");
  return action.document;
};

const commitValue = (element: HTMLElement, value: string) => {
  if (
    !(
      element instanceof HTMLInputElement ||
      element instanceof HTMLTextAreaElement
    )
  ) {
    throw new Error("入力欄ではない");
  }
  element.value = value;
  fireEvent.blur(element);
};

describe("HTML 資料の属性の欄", () => {
  it("文は、欄の外へ出たときに1回の編集として確定する", () => {
    const onEdit = renderPanel({
      kind: "block",
      sectionId: "s01",
      blockId: "b01",
    });
    commitValue(screen.getByLabelText("本文"), "直した本文");
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(edited(onEdit).sections[0]?.blocks[0]).toMatchObject({
      props: { text: "直した本文" },
    });
  });

  it("表は行を足せる", () => {
    const onEdit = renderPanel({
      kind: "block",
      sectionId: "s01",
      blockId: "b02",
    });
    commitValue(screen.getByLabelText("行"), "ア | イ\nウ | エ");
    expect(findBlock(edited(onEdit), "s01", "b02")).toMatchObject({
      props: {
        headers: ["項目", "内容"],
        rows: [
          ["ア", "イ"],
          ["ウ", "エ"],
        ],
      },
    });
  });

  it("注意の札は「確かめた結果」に変えられ、種類も替えられる", () => {
    const onEdit = renderPanel({
      kind: "block",
      sectionId: "s01",
      blockId: "b03",
    });
    commitValue(screen.getByLabelText("ラベル"), "確かめた結果");
    expect(findBlock(edited(onEdit), "s01", "b03")).toMatchObject({
      props: { kind: "warning", label: "確かめた結果" },
    });
    fireEvent.change(screen.getByLabelText("種類"), {
      target: { value: "success" },
    });
    expect(findBlock(edited(onEdit), "s01", "b03")).toMatchObject({
      props: { kind: "success" },
    });
  });

  it("カードは3枚にできる", () => {
    const onEdit = renderPanel({
      kind: "block",
      sectionId: "s01",
      blockId: "b04",
    });
    fireEvent.change(screen.getByLabelText("列の数"), {
      target: { value: "3" },
    });
    expect(findBlock(edited(onEdit), "s01", "b04")).toMatchObject({
      props: { columns: 3 },
    });
    fireEvent.click(screen.getByRole("button", { name: "カードを追加" }));
    expect(findBlock(edited(onEdit), "s01", "b04")).toMatchObject({
      props: { items: [{}, {}, { title: "タイトル" }] },
    });
  });

  it("ブロックを選んでいなければ、セクションの見出しと深さを直せる", () => {
    const onEdit = renderPanel({ kind: "section", sectionId: "s01" });
    commitValue(screen.getByLabelText("見出し"), "直した見出し");
    expect(findSection(edited(onEdit), "s01")).toMatchObject({
      heading: "直した見出し",
    });
  });

  it("表紙まわりは、題と要約の出し入れを持つ", () => {
    const onEdit = renderPanel({ kind: "front" });
    commitValue(screen.getByLabelText("資料の題"), "直した題");
    expect(edited(onEdit).head.title).toBe("直した題");
    fireEvent.click(screen.getByLabelText("要約を出す"));
    expect(edited(onEdit).summary).toEqual({ text: "" });
  });

  it("見た目の値の欄は出さない", () => {
    renderPanel({ kind: "block", sectionId: "s01", blockId: "b01" });
    expect(screen.queryByLabelText("x")).toBeNull();
    expect(screen.queryByLabelText("色")).toBeNull();
  });
});
