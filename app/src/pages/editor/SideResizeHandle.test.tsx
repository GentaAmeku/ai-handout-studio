import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SideResizeHandle } from "./SideResizeHandle";

afterEach(() => cleanup());

// jsdom に無いポインターキャプチャを足す
if (Element.prototype.setPointerCapture === undefined) {
  Element.prototype.setPointerCapture = vi.fn() as never;
  Element.prototype.releasePointerCapture = vi.fn() as never;
}

const setup = (onChange = vi.fn()) => {
  render(
    <SideResizeHandle width={360} min={300} max={560} onChange={onChange} />,
  );
  return { handle: screen.getByRole("slider"), onChange };
};

describe("SideResizeHandle", () => {
  it("ドラッグ中(ボタン押下)の移動だけ幅を変える", () => {
    const { handle, onChange } = setup();
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    // 境目を左へ引くと広がる
    fireEvent.pointerMove(handle, { clientX: 60, buttons: 1 });
    expect(onChange).toHaveBeenLastCalledWith(400);
    fireEvent.pointerUp(handle);
  });

  it("ボタンを押していない移動では幅を変えない(取りこぼした drag の残骸対策)", () => {
    const { handle, onChange } = setup();
    // pointerup を取りこぼした想定: down のまま up が来ない
    fireEvent.pointerDown(handle, { clientX: 100, pointerId: 1 });
    fireEvent.pointerMove(handle, { clientX: 60, buttons: 1 });
    expect(onChange).toHaveBeenCalledTimes(1);
    // 外で離され、up が届かなかった後にホバーで戻ってきても動かさない
    fireEvent.pointerMove(handle, { clientX: 140, buttons: 0 });
    fireEvent.pointerMove(handle, { clientX: 20, buttons: 0 });
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("左右キーで幅を変える", () => {
    const { handle, onChange } = setup();
    fireEvent.keyDown(handle, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith(376);
    fireEvent.keyDown(handle, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith(344);
  });
});
