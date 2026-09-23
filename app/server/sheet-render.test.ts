// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SheetDocument } from "../src/schema/sheet.ts";
import { sheetBody, sheetView } from "./sheet-render.ts";

const doc: SheetDocument = {
  schemaVersion: 1,
  id: "demo",
  revision: "1",
  title: "題",
  questions: [
    {
      id: "q1",
      title: "問い",
      type: "single",
      options: [
        { id: "a", label: "A" },
        { id: "b", label: "B" },
      ],
    },
  ],
};

// 設定の組織名は題名の上に、HTML 資料の署名の行と同じ形で出す
describe("質問票の組織名", () => {
  const signature = '<div class="ds-signature"><span>○○株式会社</span></div>';

  it("組織名があれば、どの骨格でも見出しの帯の1行目(題名の上)に出す", () => {
    const view = { ...sheetView(doc, undefined), orgName: "○○株式会社" };
    for (const layout of ["focus", "all", "print"] as const) {
      expect(sheetBody(view, layout, true)).toContain(
        `<header class="ds-board-heading">${signature}<div class="ds-board-title"><h1>題</h1>`,
      );
    }
  });

  it("組織名が無ければ出さない", () => {
    expect(sheetBody(sheetView(doc, undefined), "focus", true)).not.toContain(
      "ds-signature",
    );
  });
});

// 資料の言語。既定(lang を渡さない)は今までどおり ja
describe("質問票の画面の文言の言語", () => {
  // ここに無い言葉(題名・質問・選択肢)は利用者の中身なので訳さない
  const jaChrome = [
    "質問一覧を閉じる",
    "質問一覧を開く",
    "回答をコピー",
    "あなたの回答",
    "前へ",
    "次の質問へ",
    "回答一覧へ",
    "未入力",
    "問入力済み",
    "下書きを保存",
    "下書きは保存されています。",
  ];

  it("lang を渡さなければ今までどおり ja で描く", () => {
    const body = sheetBody(sheetView(doc, undefined), "focus", true);
    expect(body).toContain("質問一覧を閉じる");
    expect(body).toContain("回答をコピー");
  });

  it("lang: en は画面の文言だけ英語にし、利用者の中身(題・問い・選択肢)は訳さない", () => {
    const body = sheetBody(sheetView(doc, undefined, 0, "en"), "focus", true);
    jaChrome.forEach((word) => {
      expect(body).not.toContain(word);
    });
    expect(body).toContain("Close question list");
    expect(body).toContain("Copy answers");
    expect(body).toContain("Your answer");
    // 利用者の中身はそのまま
    expect(body).toContain(">題<");
    expect(body).toContain(">問い<");
    expect(body).toContain(">A<");
  });

  // 推奨の印・条件つきの必須・通知・流れの図の読み上げの説明まで、英語の中身の質問票に和文が出ない
  it("lang: en で推奨・複数選択・記入欄・図を持つ質問票でも、どの骨格にも和文が残らない", () => {
    const english: SheetDocument = {
      schemaVersion: 1,
      id: "english",
      revision: "1",
      title: "Pick a plan",
      lang: "en",
      questions: [
        {
          id: "plan",
          title: "Which plan?",
          type: "single",
          options: [
            { id: "a", label: "Plan A" },
            { id: "b", label: "Plan B" },
          ],
          recommended: ["a"],
          fields: [{ id: "why", label: "Reason", requiredWhen: ["b"] }],
          notices: [
            { kind: "warning", text: "Check the budget" },
            { kind: "success", text: "Reviewed" },
          ],
          visual: {
            type: "flow",
            figure: {
              figure: 1,
              caption: "How it goes",
              flow: [
                { label: "Start" },
                {
                  label: "Split",
                  fork: [{ label: "Left" }, { label: "Right" }],
                },
                { label: "End" },
              ],
            },
          },
        },
        {
          id: "extras",
          title: "Which extras?",
          type: "multiple",
          options: [
            { id: "x", label: "Extra X" },
            { id: "y", label: "Extra Y" },
          ],
          recommended: ["x", "y"],
          fields: [{ id: "note", label: "Detail", required: true }],
        },
        { id: "free", title: "Anything else?", type: "text" },
      ],
    };
    const japanese = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
    for (const layout of ["focus", "all", "print"] as const) {
      const body = sheetBody(
        sheetView(english, undefined, 0, "en"),
        layout,
        true,
      )
        // 図の生成器の印(HTML のコメント)は画面にも読み上げにも出ない
        .replace(/<!--[\s\S]*?-->/g, "");
      expect(body.match(japanese)?.[0], layout).toBeUndefined();
      expect(body, layout).toContain("Plan A");
      expect(body, layout).toContain(" (recommended)");
    }
    const focus = sheetBody(
      sheetView(english, undefined, 0, "en"),
      "focus",
      true,
    );
    expect(focus).toContain("<span>Plan A (recommended)</span>");
    expect(focus).toContain('aria-label="A flow diagram from top to bottom.');
    // 作者が label に書いていたら二重にしない
    const written = sheetBody(
      sheetView(
        {
          ...english,
          questions: [
            {
              id: "plan",
              title: "Which plan?",
              type: "single",
              options: [
                { id: "a", label: "Plan A (recommended)" },
                { id: "b", label: "Plan B" },
              ],
              recommended: ["a"],
            },
          ],
        },
        undefined,
        0,
        "en",
      ),
      "focus",
      true,
    );
    expect(written).toContain("<span>Plan A (recommended)</span>");
    expect(written).not.toContain("(recommended) (recommended)");
  });

  it("lang: en は all・print の骨格でも日本語のチラつきが無い", () => {
    for (const layout of ["all", "print"] as const) {
      const body = sheetBody(sheetView(doc, undefined, 0, "en"), layout, true);
      jaChrome.forEach((word) => {
        expect(body).not.toContain(word);
      });
    }
  });
});
