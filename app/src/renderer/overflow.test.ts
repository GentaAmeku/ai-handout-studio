import { describe, expect, it } from "vitest";
import { en } from "../i18n/en";
import { ja, type MessageKey } from "../i18n/ja";
import { overflowMessage } from "../i18n/language";
import { inspectOverflow } from "./overflow";

// jsdom はレイアウトを計算しないので、実寸だけ差し込む
const sized = (
  element: HTMLElement,
  size: {
    scrollHeight: number;
    clientHeight: number;
    scrollWidth?: number;
    clientWidth?: number;
  },
) => {
  Object.entries({ scrollWidth: 100, clientWidth: 100, ...size }).forEach(
    ([key, value]) => {
      Object.defineProperty(element, key, { value, configurable: true });
    },
  );
  return element;
};

const block = (id: string) => {
  const element = document.createElement("div");
  element.dataset.blockId = id;
  return element;
};

describe("inspectOverflow", () => {
  it("枠より高い中身のブロックを、はみ出した量(px)つきで返す。文言は持たない", () => {
    const root = document.createElement("div");
    const slide = document.createElement("div");
    slide.dataset.slideId = "s04";
    slide.append(
      sized(block("b01"), { scrollHeight: 96, clientHeight: 96 }),
      sized(block("b02"), { scrollHeight: 120, clientHeight: 108 }),
      sized(block("b03"), { scrollHeight: 97, clientHeight: 96 }),
    );
    root.append(slide);

    expect(inspectOverflow(root)).toEqual([
      {
        slideId: "s04",
        ok: false,
        issues: [
          {
            blockId: "b02",
            type: "overflow",
            overX: 0,
            overY: 12,
          },
        ],
      },
    ]);
  });

  it("はみ出しが無いスライドは ok を返す", () => {
    const root = document.createElement("div");
    const slide = document.createElement("div");
    slide.dataset.slideId = "s01";
    slide.append(sized(block("b01"), { scrollHeight: 10, clientHeight: 10 }));
    root.append(slide);
    expect(inspectOverflow(root)).toEqual([
      { slideId: "s01", ok: true, issues: [] },
    ]);
  });

  it("横のはみ出しは overX に入れ、許容差以下の縦は 0 にする", () => {
    const root = document.createElement("div");
    const slide = document.createElement("div");
    slide.dataset.slideId = "s02";
    slide.append(
      sized(block("b02"), {
        scrollHeight: 11,
        clientHeight: 10,
        scrollWidth: 130,
        clientWidth: 100,
      }),
    );
    root.append(slide);
    expect(inspectOverflow(root)[0]?.issues).toEqual([
      { blockId: "b02", type: "overflow", overX: 30, overY: 0 },
    ]);
  });
});

// 表示側の文。言語は呼ぶ側の t で決まる
describe("overflowMessage", () => {
  const tFor =
    (dictionary: Record<MessageKey, string>) =>
    (key: MessageKey, vars?: Record<string, string | number>) =>
      Object.entries(vars ?? {}).reduce(
        (text, [name, value]) => text.split(`{${name}}`).join(String(value)),
        dictionary[key],
      );

  it("縦のはみ出しを先に言う", () => {
    expect(overflowMessage({ overX: 30, overY: 12 }, tFor(ja))).toBe(
      "本文が12pxはみ出している",
    );
    expect(overflowMessage({ overX: 0, overY: 4 }, tFor(en))).toBe(
      "Text overflows by 4px",
    );
  });

  it("縦が 0 なら横の量を言う", () => {
    expect(overflowMessage({ overX: 30, overY: 0 }, tFor(ja))).toBe(
      "横に30pxはみ出している",
    );
    expect(overflowMessage({ overX: 30, overY: 0 }, tFor(en))).toBe(
      "Overflows sideways by 30px",
    );
  });
});
