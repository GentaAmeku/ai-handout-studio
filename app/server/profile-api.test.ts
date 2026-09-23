// @vitest-environment node
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProfileDetail } from "../src/api/types";
import { createApi } from "./api";
import { resolveLan } from "./deck-cli.ts";
import {
  migrateProfile,
  readFeatures,
  readLocale,
  readSettings,
  readSettingsFile,
  saveProfile,
} from "./profile";
import { DEFAULT_SELECTION } from "./test-fixtures.ts";

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const context = { workspaceRoot: "" };

const profile = {
  orgName: "○○株式会社",
};

const legacyColors = {
  primary: "#C2410C",
  text: "#1E293B",
  muted: "#64748B",
  bg: "#FFFFFF",
  surface: "#F8FAFC",
  tint: "#FFEDD5",
};

beforeEach(async () => {
  context.workspaceRoot = await mkdtemp(
    join(tmpdir(), "ai-handout-studio-prof-"),
  );
});

afterEach(async () => {
  await rm(context.workspaceRoot, { recursive: true, force: true });
});

const api = () =>
  createApi({
    repoRoot,
    workspaceRoot: context.workspaceRoot,
  });

const send = (method: string, path: string, body?: unknown) =>
  api().request(path, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe("プロフィール", () => {
  it("未設定なら null を返し、保存すると読み出せる", async () => {
    expect(
      ((await (await send("GET", "/api/profile")).json()) as ProfileDetail)
        .profile,
    ).toBeNull();

    const saved = await send("PUT", "/api/profile", profile);
    expect(saved.status).toBe(200);
    expect(((await saved.json()) as ProfileDetail).profile).toEqual({
      orgName: "○○株式会社",
    });

    const onDisk = JSON.parse(
      await readFile(join(context.workspaceRoot, "profile.json"), "utf8"),
    );
    expect(onDisk.theme).toBeUndefined();
    expect(onDisk.colors).toBeUndefined();

    expect(
      ((await (await send("GET", "/api/profile")).json()) as ProfileDetail)
        .profile?.orgName,
    ).toBe("○○株式会社");
  });

  it("workspace/ のフォルダが無くても保存できる(新しい clone の初回起動)", async () => {
    await rm(context.workspaceRoot, { recursive: true, force: true });

    const saved = await send("PUT", "/api/profile", profile);
    expect(saved.status).toBe(200);

    const onDisk = JSON.parse(
      await readFile(join(context.workspaceRoot, "profile.json"), "utf8"),
    );
    expect(onDisk).toEqual({ orgName: "○○株式会社" });
  });

  it("テーマ・色を持つプロフィールは 400 で保存しない", async () => {
    const withTheme = await send("PUT", "/api/profile", {
      ...profile,
      theme: "default",
    });
    expect(withTheme.status).toBe(400);
    const withColors = await send("PUT", "/api/profile", {
      ...profile,
      colors: legacyColors,
    });
    expect(withColors.status).toBe(400);
    expect(
      ((await (await send("GET", "/api/profile")).json()) as ProfileDetail)
        .profile,
    ).toBeNull();
  });

  it("テーマや色を持つ旧形式のプロフィールも、それらを外して読める", async () => {
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify({ ...profile, theme: "default", colors: legacyColors }),
    );
    const read = (
      (await (await send("GET", "/api/profile")).json()) as ProfileDetail
    ).profile;
    expect(read).toEqual({ orgName: "○○株式会社" });
    expect(read).not.toHaveProperty("colors");
    expect(read).not.toHaveProperty("theme");
  });
});

describe("設定(言語と任意の機能。141)", () => {
  it("未設定なら LANG から locale を決め、features は全部 false", async () => {
    const original = process.env.LANG;
    process.env.LANG = "en_US.UTF-8";
    try {
      expect(await readSettings(context.workspaceRoot)).toEqual({
        orgName: "",
        locale: "en",
        features: { lan: false, imageGeneration: false, share: false },
        agentInstructions: "ask",
      });
      expect(await readLocale(context.workspaceRoot)).toBe("en");
    } finally {
      process.env.LANG = original;
    }
  });

  it("LANG が ja で始まれば locale は ja", async () => {
    const original = process.env.LANG;
    process.env.LANG = "ja_JP.UTF-8";
    try {
      expect(await readLocale(context.workspaceRoot)).toBe("ja");
    } finally {
      process.env.LANG = original;
    }
  });

  // 画面の言語(149)が読む値。GET /api/profile の locale は既定値・LANG のフォールバック込みで返す
  it("GET /api/profile の locale は、保存が無ければ LANG、保存があればそれに従う", async () => {
    const original = process.env.LANG;
    process.env.LANG = "en_US.UTF-8";
    try {
      const unset = (await (
        await send("GET", "/api/profile")
      ).json()) as ProfileDetail;
      expect(unset.locale).toBe("en");
    } finally {
      process.env.LANG = original;
    }

    await saveProfile(context.workspaceRoot, { orgName: "", locale: "ja" });
    const savedJa = (await (
      await send("GET", "/api/profile")
    ).json()) as ProfileDetail;
    expect(savedJa.locale).toBe("ja");

    const put = (await (
      await send("PUT", "/api/profile", { orgName: "新" })
    ).json()) as ProfileDetail;
    // orgName だけの保存でも、すでにある locale は消えない
    expect(put.locale).toBe("ja");
  });

  it("保存した locale・features を、既定値で埋めた形で読める", async () => {
    await saveProfile(context.workspaceRoot, {
      orgName: "○○株式会社",
      locale: "en",
      features: { lan: true },
    });
    expect(await readLocale(context.workspaceRoot)).toBe("en");
    expect(await readFeatures(context.workspaceRoot)).toEqual({
      lan: true,
      imageGeneration: false,
      share: false,
    });
  });

  it("orgName だけの保存では、すでにある locale・features を消さない(画面の設定)", async () => {
    await saveProfile(context.workspaceRoot, {
      orgName: "旧",
      locale: "en",
      features: { lan: true, imageGeneration: true },
    });
    // ProfilePage は orgName だけを送る
    const saved = await saveProfile(context.workspaceRoot, { orgName: "新" });
    expect(saved).toEqual({
      success: true,
      profile: {
        orgName: "新",
        locale: "en",
        features: { lan: true, imageGeneration: true },
      },
    });
    expect(await readSettings(context.workspaceRoot)).toEqual({
      orgName: "新",
      locale: "en",
      features: { lan: true, imageGeneration: true, share: false },
      agentInstructions: "ask",
    });
  });
});

describe("壊れた profile.json", () => {
  const broken = {
    orgName: "○○株式会社",
    locale: "EN",
    features: { lan: true },
  };
  const writeBroken = async (text: string) => {
    await writeFile(join(context.workspaceRoot, "profile.json"), text);
  };

  it("値が1つ合わなければ、settings の読み出しは理由を返して止まる", async () => {
    await writeBroken(JSON.stringify(broken));
    const result = await readSettingsFile(context.workspaceRoot);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toContain("profile.json が読めない");
    expect(result.message).toContain("locale");
  });

  it("JSON でなくても、settings の読み出しは理由を返して止まる", async () => {
    await writeBroken("{ orgName: ");
    expect((await readSettingsFile(context.workspaceRoot)).success).toBe(false);
  });

  it("保存(settings --set・画面の設定)は、壊れたファイルを上書きしない", async () => {
    const text = JSON.stringify(broken);
    await writeBroken(text);
    const saved = await saveProfile(context.workspaceRoot, {
      orgName: "",
      locale: "en",
      features: { share: true },
    });
    expect(saved.success).toBe(false);
    expect(
      await readFile(join(context.workspaceRoot, "profile.json"), "utf8"),
    ).toBe(text);
    const response = await send("PUT", "/api/profile", { orgName: "新" });
    expect(response.status).toBe(400);
    expect(
      await readFile(join(context.workspaceRoot, "profile.json"), "utf8"),
    ).toBe(text);
  });

  it("資料を作るときの言語と open の既定は、壊れていれば既定値で読む(止めない)", async () => {
    await writeBroken(JSON.stringify(broken));
    expect(await readFeatures(context.workspaceRoot)).toEqual({
      lan: false,
      imageGeneration: false,
      share: false,
    });
  });

  it("無ければ settings の読み出しは既定値で埋めて返す", async () => {
    const result = await readSettingsFile(context.workspaceRoot);
    expect(result).toMatchObject({
      success: true,
      settings: {
        orgName: "",
        features: { lan: false, imageGeneration: false, share: false },
      },
    });
  });
});

// open・restart の LAN の決め方(scripts/cli.ts の lanOf と同じ組み合わせ)
describe("open・restart は設定の features.lan を読む", () => {
  const lanFor = async (
    saved: boolean | undefined,
    override: boolean | undefined,
  ): Promise<boolean> => {
    if (saved !== undefined) {
      await saveProfile(context.workspaceRoot, {
        orgName: "",
        features: { lan: saved },
      });
    }
    return resolveLan(override, await readFeatures(context.workspaceRoot));
  };

  it("--lan / --no-lan が無ければ設定に従い、設定が無ければ開かない", async () => {
    expect(await lanFor(undefined, undefined)).toBe(false);
    expect(await lanFor(true, undefined)).toBe(true);
    expect(await lanFor(false, undefined)).toBe(false);
  });

  it("--lan / --no-lan はその起動だけ設定を上書きする", async () => {
    expect(await lanFor(true, false)).toBe(false);
    expect(await lanFor(false, true)).toBe(true);
    expect(await lanFor(undefined, true)).toBe(true);
    // 上書きしても設定は変わらない
    expect((await readFeatures(context.workspaceRoot)).lan).toBe(false);
  });
});

describe("プロフィールの色とテーマの移行", () => {
  const designDir = fileURLToPath(new URL("../../design", import.meta.url));
  const designCopy = { dir: "" };

  beforeEach(async () => {
    designCopy.dir = await mkdtemp(join(tmpdir(), "ai-handout-studio-design-"));
    await cp(designDir, designCopy.dir, { recursive: true });
    // design/selection.json の既定(利用者が選んだテンプレート)に依らず確かめる
    await writeFile(
      join(designCopy.dir, "selection.json"),
      `${JSON.stringify(DEFAULT_SELECTION, null, 2)}\n`,
    );
  });

  afterEach(async () => {
    await rm(designCopy.dir, { recursive: true, force: true });
  });

  const readJsonFile = async (path: string) =>
    JSON.parse(await readFile(path, "utf8"));

  it("colors をどの区分の default のテンプレートにも移し、profile からは外す", async () => {
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify({
        displayName: "天久",
        orgName: "",
        colors: legacyColors,
      }),
    );
    const result = await migrateProfile(context.workspaceRoot, designCopy.dir);
    expect(result.migrated).toBe(true);

    for (const surface of ["slide", "sheet", "document"]) {
      const template = await readJsonFile(
        join(designCopy.dir, "templates", surface, "default", "template.json"),
      );
      expect(template.tokens.color).toMatchObject({
        primary: "#c2410c",
        tint: "#ffedd5",
      });
      // 色だけを移し、部品の選択はそのまま残す
      expect(template.components.table).toBeDefined();
    }
    expect(
      await readJsonFile(join(context.workspaceRoot, "profile.json")),
    ).toEqual({ orgName: "" });
    const css = await readFile(
      join(designCopy.dir, "dist", "slide", "default.css"),
      "utf8",
    );
    expect(css).toContain("--color-primary: #c2410c;");
  });

  it("theme をスライドの既定のテンプレートにし、そのテンプレートで slide/tokens.css を作る", async () => {
    const acme = await readJsonFile(
      join(designCopy.dir, "templates", "slide", "default", "template.json"),
    );
    await mkdir(join(designCopy.dir, "templates", "slide", "acme"));
    await writeFile(
      join(designCopy.dir, "templates", "slide", "acme", "template.json"),
      JSON.stringify({ ...acme, tokens: { color: { primary: "#0f766e" } } }),
    );
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify({ ...profile, theme: "acme" }),
    );
    const result = await migrateProfile(context.workspaceRoot, designCopy.dir);
    expect(result.migrated).toBe(true);
    expect(await readJsonFile(join(designCopy.dir, "selection.json"))).toEqual({
      slide: "acme",
      sheet: "default",
      document: "default",
    });
    expect(
      await readJsonFile(join(context.workspaceRoot, "profile.json")),
    ).toEqual(profile);
    expect(
      await readFile(
        join(designCopy.dir, "dist", "slide", "tokens.css"),
        "utf8",
      ),
    ).toContain("--color-primary: #0f766e;");
    expect(
      await readFile(
        join(designCopy.dir, "dist", "sheet", "tokens.css"),
        "utf8",
      ),
    ).not.toContain("--color-primary: #0f766e;");
  });

  it("スライドのテンプレートに無い名前は移さず、profile からは外す", async () => {
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify({ ...profile, theme: "gone" }),
    );
    const result = await migrateProfile(context.workspaceRoot, designCopy.dir);
    expect(result.migrated).toBe(true);
    expect(
      (await readJsonFile(join(designCopy.dir, "selection.json"))).slide,
    ).toBe("default");
    expect(
      await readJsonFile(join(context.workspaceRoot, "profile.json")),
    ).toEqual(profile);
  });

  it("移行済み・プロフィール無しなら何もしない", async () => {
    expect(await migrateProfile(context.workspaceRoot, designCopy.dir)).toEqual(
      { migrated: false },
    );
    await writeFile(
      join(context.workspaceRoot, "profile.json"),
      JSON.stringify(profile),
    );
    expect(await migrateProfile(context.workspaceRoot, designCopy.dir)).toEqual(
      { migrated: false },
    );
  });
});
