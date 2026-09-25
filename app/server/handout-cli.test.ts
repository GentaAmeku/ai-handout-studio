// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatOpen, parseCli } from "./deck-cli";
import { formatHandout } from "./handout-cli";

describe("parseCli(sheet / document)", () => {
  it("質問票の new・update・answers・export を読み分ける", () => {
    expect(
      parseCli([
        "sheet",
        "new",
        "--questions",
        "q.json",
        "--template",
        "paper",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-new",
        kind: "sheet",
        file: "q.json",
        templateId: "paper",
      },
    });
    expect(
      parseCli([
        "sheet",
        "update",
        "sheet_20260920_001",
        "--questions",
        "q.json",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-update",
        kind: "sheet",
        id: "sheet_20260920_001",
        file: "q.json",
      },
    });
    expect(
      parseCli([
        "sheet",
        "answers",
        "sheet_20260920_001",
        "--answers",
        "a.json",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "sheet-answers",
        id: "sheet_20260920_001",
        file: "a.json",
      },
    });
    expect(parseCli(["sheet", "export", "sheet_20260920_001"])).toEqual({
      success: true,
      command: {
        name: "handout-export",
        kind: "sheet",
        id: "sheet_20260920_001",
      },
    });
  });

  it("質問票は --layout で並べ方を選べる。質問票ごとに選ぶ", () => {
    expect(
      parseCli(["sheet", "new", "--questions", "q.json", "--layout", "all"]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-new",
        kind: "sheet",
        file: "q.json",
        layout: "all",
      },
    });
    // --questions なしでも回る
    expect(
      parseCli(["sheet", "update", "sheet_20260920_001", "--layout", "print"]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-update",
        kind: "sheet",
        id: "sheet_20260920_001",
        layout: "print",
      },
    });
    // --questions と --layout を両方渡せる
    expect(
      parseCli([
        "sheet",
        "update",
        "sheet_20260920_001",
        "--questions",
        "q.json",
        "--layout",
        "focus",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-update",
        kind: "sheet",
        id: "sheet_20260920_001",
        file: "q.json",
        layout: "focus",
      },
    });
    // 間違った値はエラー
    expect(
      parseCli(["sheet", "new", "--questions", "q.json", "--layout", "wide"]),
    ).toMatchObject({ success: false });
    // 質問票だけの機能
    expect(
      parseCli(["document", "new", "--json", "doc.json", "--layout", "all"]),
    ).toMatchObject({ success: false });
    // --questions も --layout も無ければ変える中身が無い
    expect(parseCli(["sheet", "update", "sheet_20260920_001"]).success).toBe(
      false,
    );
  });

  it("HTML 資料は題名と本文の HTML を渡す", () => {
    expect(
      parseCli([
        "document",
        "new",
        "--title",
        " 設計書 ",
        "--html",
        "body.html",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-new",
        kind: "document",
        file: "body.html",
        format: "html",
        title: "設計書",
      },
    });
    expect(parseCli(["document", "new", "--json", "doc.json"])).toEqual({
      success: true,
      command: {
        name: "handout-new",
        kind: "document",
        file: "doc.json",
        format: "json",
      },
    });
    expect(
      parseCli(["document", "update", "doc_20260920_001", "--json", "d.json"]),
    ).toMatchObject({
      success: true,
      command: { name: "handout-update", format: "json", file: "d.json" },
    });
    expect(
      parseCli(["document", "new", "--json", "a.json", "--html", "b.html"])
        .success,
    ).toBe(false);
    expect(
      parseCli([
        "document",
        "export",
        "doc_20260920_001",
        "--out",
        "/tmp/a.html",
      ]),
    ).toEqual({
      success: true,
      command: {
        name: "handout-export",
        kind: "document",
        id: "doc_20260920_001",
        out: "/tmp/a.html",
      },
    });
  });

  it("中身のファイル・題名・id が足りないときは失敗にする", () => {
    expect(parseCli(["sheet", "new"]).success).toBe(false);
    expect(parseCli(["document", "new", "--html", "b.html"]).success).toBe(
      false,
    );
    expect(parseCli(["sheet", "export"]).success).toBe(false);
    // 区分と id の形が合っていない
    expect(parseCli(["sheet", "export", "doc_20260920_001"]).success).toBe(
      false,
    );
    expect(parseCli(["document", "answers", "doc_20260920_001"]).success).toBe(
      false,
    );
    expect(parseCli(["sheet", "publish"]).success).toBe(false);
  });
});

describe("open の出力", () => {
  it("質問票と HTML 資料は、それぞれの区分の経路と中身のファイルを指す", () => {
    expect(
      formatOpen("/ws", "http://127.0.0.1:5190", "sheet_20260920_001"),
    ).toBe(
      "url: http://127.0.0.1:5190/sheets/sheet_20260920_001\nreadUrl: http://127.0.0.1:5190/api/sheets/sheet_20260920_001/preview\npath: /ws/sheets/sheet_20260920_001/questions.json",
    );
    expect(formatOpen("/ws", "http://127.0.0.1:5190", "doc_20260920_001")).toBe(
      "url: http://127.0.0.1:5190/documents/doc_20260920_001\nreadUrl: http://127.0.0.1:5190/api/documents/doc_20260920_001/preview\npath: /ws/documents/doc_20260920_001/document.json",
    );
  });

  it("LAN の origin を渡すと、lanUrl・lanReadUrl を同じ形で並べる", () => {
    expect(
      formatOpen("/ws", "http://127.0.0.1:5190", "sheet_20260920_001", [
        "http://192.168.1.20:5190",
        "http://10.0.0.5:5190",
      ]),
    ).toBe(
      [
        "url: http://127.0.0.1:5190/sheets/sheet_20260920_001",
        "readUrl: http://127.0.0.1:5190/api/sheets/sheet_20260920_001/preview",
        "lanUrl: http://192.168.1.20:5190/sheets/sheet_20260920_001",
        "lanReadUrl: http://192.168.1.20:5190/api/sheets/sheet_20260920_001/preview",
        "lanUrl: http://10.0.0.5:5190/sheets/sheet_20260920_001",
        "lanReadUrl: http://10.0.0.5:5190/api/sheets/sheet_20260920_001/preview",
        "path: /ws/sheets/sheet_20260920_001/questions.json",
      ].join("\n"),
    );
    expect(
      formatOpen("/ws", "http://127.0.0.1:5190", "deck_20260918_001", [
        "http://192.168.1.20:5190",
      ]),
    ).toBe(
      [
        "url: http://127.0.0.1:5190/decks/deck_20260918_001",
        "lanUrl: http://192.168.1.20:5190/decks/deck_20260918_001",
        "path: /ws/decks/deck_20260918_001/deck.json",
      ].join("\n"),
    );
  });

  it("open と restart は --lan を id の前後どちらでも受ける", () => {
    expect(parseCli(["open", "--lan"])).toEqual({
      success: true,
      command: { name: "open", lan: true },
    });
    expect(parseCli(["restart", "--lan", "sheet_20260920_001"])).toEqual({
      success: true,
      command: { name: "restart", id: "sheet_20260920_001", lan: true },
    });
    expect(parseCli(["open", "doc_20260920_001", "--lan"])).toEqual({
      success: true,
      command: { name: "open", id: "doc_20260920_001", lan: true },
    });
    expect(parseCli(["open", "doc_20260920_001"])).toEqual({
      success: true,
      command: { name: "open", id: "doc_20260920_001" },
    });
    expect(parseCli(["open", "--wan"]).success).toBe(false);
  });

  it("保存の報告は id・場所・開く URL・テンプレートを出す", () => {
    expect(
      formatHandout({
        kind: "sheet",
        id: "sheet_20260920_001",
        root: "/ws",
        origin: "http://127.0.0.1:5190",
        template: "paper",
        createdAt: "2026-09-20T01:00:00.000Z",
      }),
    ).toBe(
      [
        "id: sheet_20260920_001",
        "path: /ws/sheets/sheet_20260920_001/questions.json",
        "url: http://127.0.0.1:5190/sheets/sheet_20260920_001",
        "readUrl: http://127.0.0.1:5190/api/sheets/sheet_20260920_001/preview",
        "createdAt: 2026-09-20T01:00:00.000Z",
        "template: paper",
      ].join("\n"),
    );
  });

  it("HTML 資料の保存の報告にも原寸で読む URL と、LAN の URL を出す", () => {
    expect(
      formatHandout({
        kind: "document",
        id: "doc_20260920_001",
        root: "/ws",
        origin: "http://127.0.0.1:5190",
        template: "cobalt",
        createdAt: "2026-09-20T01:00:00.000Z",
        lanOrigins: ["http://192.168.1.20:5190"],
      }),
    ).toBe(
      [
        "id: doc_20260920_001",
        "path: /ws/documents/doc_20260920_001/document.json",
        "url: http://127.0.0.1:5190/documents/doc_20260920_001",
        "readUrl: http://127.0.0.1:5190/api/documents/doc_20260920_001/preview",
        "lanUrl: http://192.168.1.20:5190/documents/doc_20260920_001",
        "lanReadUrl: http://192.168.1.20:5190/api/documents/doc_20260920_001/preview",
        "createdAt: 2026-09-20T01:00:00.000Z",
        "template: cobalt",
      ].join("\n"),
    );
  });
});
