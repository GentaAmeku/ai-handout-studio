import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { slideTemplateSchema } from "../src/schema/design";
import { migrateRenamedTemplates } from "./template-renames";

describe("名前を変えたテンプレートの付け替え", () => {
  const dirs = { root: "", design: "" };

  beforeEach(async () => {
    const base = await mkdtemp(join(tmpdir(), "template-renames-"));
    dirs.root = join(base, "workspace");
    dirs.design = join(base, "design");
  });

  afterEach(async () => {
    await rm(dirname(dirs.root), { recursive: true, force: true });
  });

  const put = async (path: string, value: unknown): Promise<void> => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value));
  };

  const read = async (path: string): Promise<Record<string, unknown>> =>
    JSON.parse(await readFile(path, "utf8"));

  it("資料と選択の civic を cobalt へ、文書の reading を default へ直す。2回目は何もしない", async () => {
    const deck = join(dirs.root, "decks", "deck_20260901_001", "deck.json");
    const sheet = join(dirs.root, "sheets", "sheet_20260901_001", "meta.json");
    const docDir = join(dirs.root, "documents", "doc_20260901_001");
    const readingDir = join(dirs.root, "documents", "doc_20260901_002");
    const selection = join(dirs.design, "selection.json");
    await put(deck, { title: "a", theme: "civic", slides: [] });
    await put(sheet, { id: "sheet_20260901_001", template: "civic" });
    await put(join(docDir, "meta.json"), { template: "civic" });
    await put(join(docDir, "document.json"), { template: "civic" });
    await put(join(readingDir, "meta.json"), { template: "reading" });
    await put(selection, { slide: "civic", sheet: "paper", document: "civic" });

    const moved = await migrateRenamedTemplates(dirs.root, dirs.design);
    expect(moved.sort()).toEqual(
      [
        "deck_20260901_001",
        "sheet_20260901_001",
        "doc_20260901_001",
        "doc_20260901_002",
        "design/selection.json",
      ].sort(),
    );
    expect(await read(deck)).toEqual({
      title: "a",
      slides: [],
      template: "cobalt",
    });
    expect((await read(sheet)).template).toBe("cobalt");
    expect((await read(join(docDir, "meta.json"))).template).toBe("cobalt");
    expect((await read(join(docDir, "document.json"))).template).toBe("cobalt");
    expect((await read(join(readingDir, "meta.json"))).template).toBe(
      "default",
    );
    expect(await read(selection)).toEqual({
      slide: "cobalt",
      sheet: "paper",
      document: "cobalt",
    });

    expect(await migrateRenamedTemplates(dirs.root, dirs.design)).toEqual([]);
  });
});

describe("テンプレートの表示名", () => {
  const withLabel = (label: string) =>
    slideTemplateSchema.safeParse({ label, components: {} }).success;

  it("英語の名前だけを受ける", () => {
    expect(withLabel("Cobalt")).toBe(true);
    expect(withLabel("Default")).toBe(true);
    expect(withLabel("Night Sky-2")).toBe(true);
    expect(withLabel("報告書")).toBe(false);
    expect(withLabel("Cobalt の写し")).toBe(false);
    expect(withLabel("2nd")).toBe(false);
  });
});
