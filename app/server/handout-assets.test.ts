import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  IMAGE_LIMIT_BYTES,
  loadImageDataUrls,
  prepareImages,
  sniffImage,
  storeImages,
} from "./handout-assets";

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01,
]);
const PNG2 = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x02,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]);
const WEBP = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
]);

const context = { dir: "" };

beforeEach(async () => {
  context.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-assets-"));
});

afterEach(async () => {
  await rm(context.dir, { recursive: true, force: true });
});

const put = async (name: string, bytes: Uint8Array | string) => {
  await mkdir(join(context.dir, name, ".."), { recursive: true });
  await writeFile(join(context.dir, name), bytes);
};

describe("画像の種類", () => {
  it("PNG・JPEG・WebP を中身の先頭で見分け、SVG などは受けない", () => {
    expect(sniffImage(PNG)?.ext).toBe("png");
    expect(sniffImage(JPEG)?.ext).toBe("jpg");
    expect(sniffImage(WEBP)?.ext).toBe("webp");
    expect(sniffImage(new TextEncoder().encode("<svg></svg>"))).toBeUndefined();
  });
});

describe("取り込む前の確かめ", () => {
  it("JSON の場所からの相対パスを読み、assets/ にあるものは取り込まない", async () => {
    await put("shots/a.png", PNG);
    await put("doc/assets/img-1.png", PNG2);
    const prepared = await prepareImages(
      ["shots/a.png", "assets/img-1.png", "shots/a.png"],
      { baseDir: context.dir, assetsDir: join(context.dir, "doc/assets") },
    );
    expect(prepared).toMatchObject({ success: true, warnings: [] });
    expect(
      prepared.success && prepared.images.map((image) => image.src),
    ).toEqual(["shots/a.png"]);
  });

  it("無いファイル・受けない種類・大きすぎる画像を、まとめて理由つきで拒む", async () => {
    await put("a.svg", "<svg></svg>");
    await put("big.png", new Uint8Array(IMAGE_LIMIT_BYTES + 1).fill(0));
    const prepared = await prepareImages(["none.png", "a.svg", "big.png"], {
      baseDir: context.dir,
    });
    expect(prepared.success).toBe(false);
    const message = prepared.success ? "" : prepared.message;
    expect(message).toContain("見つからない: none.png");
    expect(message).toContain("PNG・JPEG・WebP だけ");
    expect(message).toContain("大きすぎる");
  });

  it("baseDir の無い保存(画面から)は、assets/ に無い画像を拒む", async () => {
    const prepared = await prepareImages(["assets/img-9.png"], {
      assetsDir: join(context.dir, "assets"),
    });
    expect(prepared).toMatchObject({ success: false });
  });

  it("1MB を超えたら警告する(止めない)", async () => {
    const bytes = new Uint8Array(1024 * 1024 + 10).fill(0);
    bytes.set(PNG);
    await put("large.png", bytes);
    const prepared = await prepareImages(["large.png"], {
      baseDir: context.dir,
    });
    expect(prepared.success && prepared.warnings).toHaveLength(1);
  });
});

describe("assets/ への取り込み", () => {
  it("img-<番号> の名前で写し、同じ中身はすでにある画像にまとめる", async () => {
    const assetsDir = join(context.dir, "assets");
    await put("assets/img-3.png", PNG);
    const mapping = await storeImages(
      [
        { src: "a.png", bytes: PNG, type: { ext: "png", mime: "image/png" } },
        {
          src: "b.jpg",
          bytes: JPEG,
          type: { ext: "jpg", mime: "image/jpeg" },
        },
        {
          src: "c.png",
          bytes: PNG2,
          type: { ext: "png", mime: "image/png" },
        },
      ],
      assetsDir,
    );
    expect(Object.fromEntries(mapping)).toEqual({
      "a.png": "assets/img-3.png",
      "b.jpg": "assets/img-4.jpg",
      "c.png": "assets/img-5.png",
    });
    expect((await readdir(assetsDir)).sort()).toEqual([
      "img-3.png",
      "img-4.jpg",
      "img-5.png",
    ]);
  });
});

describe("描くときの埋め込み", () => {
  it("assets/ の画像だけを data: にし、外へ出るパスは読まない", async () => {
    const assetsDir = join(context.dir, "doc", "assets");
    await put("doc/assets/img-1.png", PNG);
    await put("secret.png", PNG);
    const images = await loadImageDataUrls(
      ["assets/img-1.png", "assets/../../secret.png", "shots/a.png"],
      assetsDir,
    );
    expect([...images.keys()]).toEqual(["assets/img-1.png"]);
    expect(images.get("assets/img-1.png")).toMatch(/^data:image\/png;base64,/);
  });
});
