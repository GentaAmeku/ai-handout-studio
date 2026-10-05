// @vitest-environment node
import { describe, expect, it } from "vitest";
import { jpeg, png, text, webp } from "./image-fixtures.ts";
import { hasGpsLocation } from "./image-gps.ts";

describe("hasGpsLocation", () => {
  it("JPEG の APP1 に GPSInfo(0x8825)があれば true(リトル・ビッグエンディアン)", () => {
    expect(hasGpsLocation(jpeg([0x010f, 0x8825]))).toBe(true);
    expect(hasGpsLocation(jpeg([0x8825], false))).toBe(true);
  });

  it("GPSInfo が無い EXIF や EXIF の無い JPEG は false", () => {
    expect(hasGpsLocation(jpeg([0x010f, 0x0110]))).toBe(false);
    expect(hasGpsLocation(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]))).toBe(
      false,
    );
  });

  it("PNG の eXIf と WebP の EXIF も見る", () => {
    expect(hasGpsLocation(png([0x8825]))).toBe(true);
    expect(hasGpsLocation(png([0x010f]))).toBe(false);
    expect(hasGpsLocation(webp([0x8825]))).toBe(true);
    expect(hasGpsLocation(webp([0x010f]))).toBe(false);
  });

  it("画像でないバイトや途中で切れたものは false(落ちない)", () => {
    expect(hasGpsLocation(Uint8Array.from([]))).toBe(false);
    expect(hasGpsLocation(Uint8Array.from(text("hello world")))).toBe(false);
    expect(hasGpsLocation(jpeg([0x8825]).subarray(0, 14))).toBe(false);
  });
});
