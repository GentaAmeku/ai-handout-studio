import { describe, expect, it } from "vitest";
import { parseProfile, profileSchema } from "./profile";

describe("parseProfile", () => {
  it("廃止した displayName・logo・illustration は読むときに捨てる", () => {
    expect(
      parseProfile({
        displayName: "山田",
        orgName: "",
        logo: "logo.svg",
        illustration: "mascot.png",
      }),
    ).toEqual({
      success: true,
      profile: { orgName: "" },
    });
  });
});

describe("profileSchema", () => {
  it("locale と features を持てる", () => {
    const result = profileSchema.safeParse({
      orgName: "○○株式会社",
      locale: "en",
      features: { lan: true, imageGeneration: false, share: true },
    });
    expect(result.success).toBe(true);
  });

  it("locale は ja・en 以外を拒む。features も知らないキーを拒む", () => {
    expect(profileSchema.safeParse({ orgName: "", locale: "fr" }).success).toBe(
      false,
    );
    expect(
      profileSchema.safeParse({ orgName: "", features: { lan: "yes" } })
        .success,
    ).toBe(false);
    expect(
      profileSchema.safeParse({ orgName: "", features: { unknown: true } })
        .success,
    ).toBe(false);
  });
});
