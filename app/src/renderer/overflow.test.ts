import { describe, expect, it } from "vitest";
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
  it("枠より高い中身のブロックを、はみ出した量つきで返す", () => {
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
            message: "本文が12pxはみ出している",
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
});
