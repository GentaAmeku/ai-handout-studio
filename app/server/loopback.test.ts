import { describe, expect, it } from "vitest";
import { loopbackLocationOf } from "./loopback.ts";

describe("localhost を 127.0.0.1 にそろえる", () => {
  it("localhost へ来た要求は、同じポートと道の 127.0.0.1 へ送り直す", () => {
    expect(
      loopbackLocationOf("localhost:5190", "/api/sheets/sheet_1/preview?x=1"),
    ).toBe("http://127.0.0.1:5190/api/sheets/sheet_1/preview?x=1");
    expect(loopbackLocationOf("LOCALHOST:5190", "/")).toBe(
      "http://127.0.0.1:5190/",
    );
    expect(loopbackLocationOf("localhost", undefined)).toBe(
      "http://127.0.0.1/",
    );
  });

  it("127.0.0.1 やほかの名前はそのまま通す", () => {
    expect(loopbackLocationOf("127.0.0.1:5190", "/")).toBeUndefined();
    expect(loopbackLocationOf("localhost.example:5190", "/")).toBeUndefined();
    expect(loopbackLocationOf(undefined, "/")).toBeUndefined();
  });
});
