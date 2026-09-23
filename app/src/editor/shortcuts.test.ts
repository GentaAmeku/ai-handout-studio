import { afterEach, describe, expect, it } from "vitest";
import { ignoresShortcut, isInsideDialog, isTextInput } from "./shortcuts";

const mount = (html: string): Element => {
  document.body.innerHTML = html;
  const element = document.body.firstElementChild;
  if (!element) throw new Error("要素が無い");
  return element;
};

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isTextInput", () => {
  it("入力欄と編集できる要素では true、ほかは false", () => {
    expect(isTextInput(mount("<input />"))).toBe(true);
    expect(isTextInput(mount("<textarea></textarea>"))).toBe(true);
    expect(isTextInput(mount("<select></select>"))).toBe(true);
    expect(isTextInput(mount("<div>本文</div>"))).toBe(false);
    expect(isTextInput(null)).toBe(false);
  });
});

describe("isInsideDialog", () => {
  it("ダイアログの中の要素では true、外では false", () => {
    const dialog = mount("<dialog><button>閉じる</button></dialog>");
    const button = dialog.querySelector("button");
    expect(isInsideDialog(button)).toBe(true);
    expect(isInsideDialog(mount("<div></div>"))).toBe(false);
  });
});

describe("ignoresShortcut", () => {
  it("入力欄かダイアログの中なら、キー操作を受け取らない", () => {
    const dialog = mount("<dialog><button>閉じる</button></dialog>");
    expect(ignoresShortcut(dialog.querySelector("button"))).toBe(true);
    expect(ignoresShortcut(mount("<input />"))).toBe(true);
    expect(ignoresShortcut(mount("<div></div>"))).toBe(false);
  });
});
