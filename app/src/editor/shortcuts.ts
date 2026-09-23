// キー操作をどこで受け取らないかの判定

const TEXT_TAGS = ["INPUT", "TEXTAREA", "SELECT"];

// 文字の入力中は、Delete や矢印キーを文字の操作に使う
export const isTextInput = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable || TEXT_TAGS.includes(target.tagName));

// ダイアログが開いている間は、背後のスライドへキー操作を届けない
export const isInsideDialog = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest("dialog") !== null;

export const ignoresShortcut = (target: EventTarget | null): boolean =>
  isTextInput(target) || isInsideDialog(target);
