import { checkDeck, type Deck } from "../schema/deck";

// JSON タブの「適用」。壊れた入力は反映の前に弾く

export type SlideJsonResult =
  | { success: true; deck: Deck }
  | { success: false; message: string };

const parse = (
  text: string,
): { ok: true; value: unknown } | { ok: false; message: string } => {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return { ok: false, message: `JSON として読めない: ${reason}` };
  }
};

const idOf = (value: unknown): unknown =>
  typeof value === "object" && value !== null && "id" in value
    ? value.id
    : undefined;

// スライドの id は変えさせない。デッキ全体を検証して、id の重複も弾く
export const applySlideJson = (
  deck: Deck,
  slideId: string,
  text: string,
): SlideJsonResult => {
  const parsed = parse(text);
  if (!parsed.ok) return { success: false, message: parsed.message };
  if (idOf(parsed.value) !== slideId) {
    return {
      success: false,
      message: `スライドの id は "${slideId}" のままにする`,
    };
  }
  const result = checkDeck({
    ...deck,
    slides: deck.slides.map((slide) =>
      slide.id === slideId ? parsed.value : slide,
    ),
  });
  return result.success
    ? { success: true, deck: result.deck }
    : { success: false, message: result.message };
};
