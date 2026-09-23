import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import catalog from "../dev/block-catalog.json";
import { knownBlockTypes } from "../schema/block";
import { type Slide, validateDeck } from "../schema/deck";
import type { RenderContext } from "./context";
import { SlideView } from "./SlideView";

afterEach(cleanup);

const context: RenderContext = {
  pageNumber: 7,
  pageCount: 12,
  assetBaseUrl: "/dev/",
};

const slideWith = (blocks: unknown[], layout = "content"): Slide => {
  const deck = validateDeck({
    id: "deck_test",
    title: "テスト",
    theme: "default",
    size: { width: 1280, height: 720 },
    status: "draft",
    meta: {
      createdAt: "2026-09-15T00:00:00Z",
      updatedAt: "2026-09-15T00:00:00Z",
    },
    slides: [{ id: "s01", layout, blocks }],
  });
  const slide = deck.slides[0];
  if (!slide) throw new Error("スライドが無い");
  return slide;
};

describe("SlideView", () => {
  it("専用の CSS を当てるテンプレートの名前を data-template に出す", () => {
    const { container } = render(
      <>
        <SlideView slide={slideWith([])} context={context} />
        <SlideView
          slide={slideWith([])}
          context={{ ...context, template: "no-such-template" }}
        />
        <SlideView
          slide={slideWith([])}
          context={{ ...context, themeVariables: {}, template: "draft" }}
        />
        <SlideView
          slide={slideWith([])}
          context={{ ...context, themeVariables: {} }}
        />
      </>,
    );
    const names = [...container.querySelectorAll(".ds-slide")].map((slide) =>
      slide.getAttribute("data-template"),
    );
    // 未指定と知らない名前は既定のテンプレート。編集中の値は渡した名前のまま
    expect(names[0]).toBeTruthy();
    expect(names[1]).toBe(names[0]);
    expect(names.slice(2)).toEqual(["draft", null]);
  });

  it("どのページにもテンプレートが描く飾りの形を置く", () => {
    const { container } = render(
      <SlideView slide={slideWith([])} context={context} />,
    );
    expect(
      container.querySelectorAll(".ds-decoration .ds-decoration__shape"),
    ).toHaveLength(6);
  });

  it("確認用デッキで初期10種をすべて描く", () => {
    const deck = validateDeck(catalog);
    const { container } = render(
      deck.slides.map((slide) => (
        <SlideView key={slide.id} slide={slide} context={context} />
      )),
    );
    const drawn = new Set(
      [...container.querySelectorAll("[data-block-type]")].map((element) =>
        element.getAttribute("data-block-type"),
      ),
    );
    expect([...drawn]).toEqual(expect.arrayContaining([...knownBlockTypes]));
  });

  it("1280x720 の枠に、ブロックを x,y,w,h の位置で置く", () => {
    const slide = slideWith([
      {
        id: "b01",
        type: "text",
        x: 64,
        y: 120,
        w: 480,
        h: 96,
        props: { text: "本文" },
      },
    ]);
    const { container } = render(<SlideView slide={slide} context={context} />);
    const frame = container.querySelector<HTMLElement>("[data-slide-id='s01']");
    const block = container.querySelector<HTMLElement>("[data-block-id='b01']");
    expect(frame?.style.width).toBe("1280px");
    expect(frame?.style.height).toBe("720px");
    expect(block?.style.left).toBe("64px");
    expect(block?.style.top).toBe("120px");
    expect(block?.style.width).toBe("480px");
    expect(block?.style.height).toBe("96px");
  });

  it("未知の type はプレースホルダを描く", () => {
    const slide = slideWith([
      { id: "b01", type: "timeline", x: 0, y: 0, w: 100, h: 100, props: {} },
    ]);
    render(<SlideView slide={slide} context={context} />);
    expect(screen.getByText(/未対応のブロック: timeline/)).toBeTruthy();
  });

  it("footer はページ番号を Renderer から受け取る", () => {
    const slide = slideWith([
      {
        id: "b01",
        type: "footer",
        x: 64,
        y: 664,
        w: 1152,
        h: 32,
        props: { showPage: true },
      },
    ]);
    render(<SlideView slide={slide} context={context} />);
    expect(screen.getByText("7")).toBeTruthy();
  });

  it("廃止した showLogo と showIllustration は読むときに捨て、ロゴもイラストも描かない", () => {
    const slide = slideWith(
      [
        {
          id: "b01",
          type: "footer",
          x: 64,
          y: 640,
          w: 1152,
          h: 48,
          props: { showLogo: true, showPage: false, showIllustration: true },
        },
      ],
      "cover",
    );
    expect(slide.blocks[0]?.props).toEqual({ showPage: false });
    const { container } = render(<SlideView slide={slide} context={context} />);
    expect(container.querySelector("img")).toBeNull();
  });

  it("画像は assetBaseUrl からの相対で読む", () => {
    const slide = slideWith([
      {
        id: "b01",
        type: "image",
        x: 0,
        y: 0,
        w: 100,
        h: 100,
        props: { src: "assets/sample.svg", caption: "図" },
      },
    ]);
    render(<SlideView slide={slide} context={context} />);
    expect(screen.getByRole("img", { name: "図" }).getAttribute("src")).toBe(
      "/dev/assets/sample.svg",
    );
  });

  it("表紙にはテーマのウェーブを描き、本文スライドには描かない", () => {
    const cover = render(
      <SlideView slide={slideWith([], "cover")} context={context} />,
    );
    expect(cover.container.querySelector(".ds-wave")).not.toBeNull();
    cleanup();
    const content = render(
      <SlideView slide={slideWith([])} context={context} />,
    );
    expect(content.container.querySelector(".ds-wave")).toBeNull();
  });
});
