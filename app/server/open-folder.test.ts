import { describe, expect, it } from "vitest";
import { openFolderCommand } from "./open-folder.ts";

describe("フォルダを開くコマンド", () => {
  it("Mac は Finder でファイルを選んだ状態にする", () => {
    expect(openFolderCommand("/Users/me/a b/x.html", "darwin")).toBe(
      "open -R '/Users/me/a b/x.html'",
    );
  });

  it("' を含むパスも1つの引数にする", () => {
    expect(openFolderCommand("/Users/me/it's/x.html", "darwin")).toBe(
      "open -R '/Users/me/it'\\''s/x.html'",
    );
  });

  it("Windows はエクスプローラーでファイルを選んだ状態にする", () => {
    expect(openFolderCommand("C:\\Users\\me\\exports\\x.html", "win32")).toBe(
      'explorer /select,"C:\\Users\\me\\exports\\x.html"',
    );
  });

  it("そのほかはファイルの入ったフォルダを開く", () => {
    expect(openFolderCommand("/home/me/exports/x.html", "linux")).toBe(
      "xdg-open '/home/me/exports'",
    );
  });
});
