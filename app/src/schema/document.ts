import { z } from "zod";
import { localeName } from "./profile.ts";

// HTML 資料の形。正本は document.json(下半分)で、本文の断片(document.html)は移行期だけ読む。
// 断片は `.ds-*` の部品で組んだものに限る。書き出しはテンプレートの CSS を埋めた1枚の HTML にするので、
// 本文はページの枠(html・head・body)を持たない

// 本文の上限。1枚で開く前提なので、これを超えるなら資料を分ける
export const DOCUMENT_BODY_LIMIT = 1_000_000;

// 持ってはいけない要素。ページの枠・スクリプト・外から読む参照
const FORBIDDEN_TAGS = [
  "html",
  "head",
  "body",
  "script",
  "style",
  "link",
  "meta",
  "base",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "textarea",
  "button",
] as const;

const tagPattern = (tag: string): RegExp => new RegExp(`<${tag}[\\s/>]`, "i");

const classPattern = /class\s*=\s*"([^"]*)"/g;
const eventPattern = /\son[a-z]+\s*=/i;
const javascriptUrlPattern = /(?:href|src)\s*=\s*"\s*javascript:/i;
// 画像は本文に埋め込む(data:)だけにする。外から読むと配った先で欠ける
const externalSrcPattern = /\ssrc\s*=\s*"(?!data:)/i;

export type BodyCheck = { success: true } | { success: false; message: string };

const fail = (message: string): BodyCheck => ({ success: false, message });

// class は `.ds-*` だけ。部品の外の見た目を本文に持ち込ませない
const foreignClass = (html: string): string | undefined => {
  for (const match of html.matchAll(classPattern)) {
    const bad = (match[1] ?? "")
      .split(/\s+/)
      .filter((name) => name.length > 0)
      .find((name) => !name.startsWith("ds-"));
    if (bad) return bad;
  }
  return undefined;
};

export const checkDocumentBody = (html: string): BodyCheck => {
  if (html.trim().length === 0) return fail("本文が空");
  if (html.length > DOCUMENT_BODY_LIMIT) {
    return fail(`本文が大きすぎる(${DOCUMENT_BODY_LIMIT} 文字まで)`);
  }
  const tag = FORBIDDEN_TAGS.find((name) => tagPattern(name).test(html));
  if (tag) {
    return fail(
      `本文に <${tag}> は書けない。本文だけの断片を .ds-* の部品で組む`,
    );
  }
  if (eventPattern.test(html)) return fail("本文に on… の属性は書けない");
  if (javascriptUrlPattern.test(html)) {
    return fail("本文に javascript: のリンクは書けない");
  }
  if (externalSrcPattern.test(html)) {
    return fail("本文の画像は data: で埋め込む(外から読む src は書けない)");
  }
  const bad = foreignClass(html);
  return bad
    ? fail(`本文の class は ds- で始まるものだけにする: ${bad}`)
    : { success: true };
};

// ---------- document.json ----------

// HTML 資料の正本(workspace/documents/<id>/document.json)。
// 中身と構造だけを持ち、色・寸法・書体は持たない(テンプレートはテンプレートが決める)。
// DOM に組むのは app/server/document-render.ts の1か所

export const shortId = z
  .string()
  .regex(
    /^[A-Za-z0-9._-]{1,100}$/,
    "id は英数字・点・下線・ハイフンの100字以内にする",
  );

// テンプレートは名前で引く。色コードやパスを書かせない
const token = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "英小文字・数字・ハイフンの名前で指定する");

// 図の生成器の出力と、移行のための html ブロック。本文の断片と同じ検査を通す
const fragment = z.string().superRefine((html, ctx) => {
  const checked = checkDocumentBody(html);
  if (!checked.success)
    ctx.addIssue({ code: "custom", message: checked.message });
});

// 画像の場所。保存した文書は assets/ からの相対パスだけを持つ。保存の前(CLI に渡す JSON)は手元のファイルの
// パスも書け、保存のときに assets/ へ取り込む。URL・data:・Windows の区切りは通さない
export const imageSrc = z
  .string()
  .min(1, "画像の場所が空")
  .refine(
    (src) => !/^[a-z][a-z0-9+.-]*:/i.test(src) && !src.includes("\\"),
    "画像は assets/ からの相対パスか、手元の画像ファイルのパスで指定する(URL と data: は書けない)",
  );

// ブロックと props は余分なキーを通さない。色やフォント名を JSON に書かせないため
const defineBlock = <T extends string, P extends z.ZodType>(
  type: T,
  props: P,
) => z.strictObject({ id: shortId, type: z.literal(type), props });

// 部品表は skills/ai-handout-studio/references/document.md と design/samples/document.html と1対1
export const documentBlockSchema = z.discriminatedUnion("type", [
  // 段落。空行を挟まずに改行するときは \n で区切る
  defineBlock("text", z.strictObject({ text: z.string() })),
  defineBlock("bullets", z.strictObject({ items: z.array(z.string()) })),
  defineBlock(
    "ordered",
    z.strictObject({
      items: z.array(
        z.strictObject({ text: z.string(), why: z.string().optional() }),
      ),
    }),
  ),
  defineBlock(
    "table",
    z.strictObject({
      headers: z.array(z.string()),
      rows: z.array(z.array(z.string())),
      // 先頭の列を行見出し(.ds-rowlabel)にする
      rowLabel: z.boolean().optional(),
      // 数値として右へ寄せる列(.ds-num)。0 から数えた列番号
      numeric: z.array(z.number().int().nonnegative()).optional(),
    }),
  ),
  defineBlock(
    "cards",
    z.strictObject({
      columns: z.union([z.literal(2), z.literal(3)]),
      items: z.array(z.strictObject({ title: z.string(), body: z.string() })),
    }),
  ),
  defineBlock(
    "notice",
    z.strictObject({
      kind: z.enum(["info", "success", "warning"]),
      label: z.string().optional(),
      text: z.string(),
    }),
  ),
  defineBlock("note", z.strictObject({ text: z.string() })),
  defineBlock("alert", z.strictObject({ text: z.string() })),
  defineBlock("open", z.strictObject({ text: z.string() })),
  defineBlock(
    "quote",
    z.strictObject({ text: z.string(), source: z.string().optional() }),
  ),
  defineBlock(
    "code",
    z.strictObject({ text: z.string(), caption: z.string().optional() }),
  ),
  // 図の生成器が出した .ds-figure-frame の中身(svg)
  defineBlock(
    "figure",
    z.strictObject({ html: fragment, caption: z.string().optional() }),
  ),
  // 画像(スクリーンショット・生成した絵)。ファイルは資料の assets/ に置き、描くときに埋め込む
  defineBlock(
    "image",
    z.strictObject({
      src: imageSrc,
      alt: z.string(),
      caption: z.string().optional(),
    }),
  ),
  // 移行と例外のための受け皿。まず他の型を使う
  defineBlock("html", z.strictObject({ html: fragment })),
]);

export type DocumentBlock = z.infer<typeof documentBlockSchema>;
export type DocumentBlockType = DocumentBlock["type"];

// セクション。level 3 は直前の level 2 のセクションの中に h3 として入り、目次では章の下の入れ子(節)になる
const sectionSchema = z.strictObject({
  id: shortId,
  heading: z.string(),
  level: z.union([z.literal(2), z.literal(3)]).optional(),
  blocks: z.array(documentBlockSchema),
});

export type DocumentSection = z.infer<typeof sectionSchema>;

const collectIds = (
  sections: readonly DocumentSection[],
): { id: string; path: (string | number)[] }[] =>
  sections.flatMap((section, sectionIndex) => [
    { id: section.id, path: ["sections", sectionIndex, "id"] },
    ...section.blocks.map((block, blockIndex) => ({
      id: block.id,
      path: ["sections", sectionIndex, "blocks", blockIndex, "id"],
    })),
  ]);

export const documentFileSchema = z
  .strictObject({
    id: z.string().min(1),
    title: z.string(),
    // 文書のテンプレートの名前(design/templates/document/)。未指定は既定のテンプレート
    template: token.optional(),
    status: z.enum(["draft", "done"]),
    // 画面の文言(目次・署名まわりなど)の言語。無ければ ja で描く
    lang: localeName.optional(),
    meta: z.strictObject({
      audience: z.string().optional(),
      tags: z.array(z.string()).optional(),
      createdAt: z.iso.datetime(),
      updatedAt: z.iso.datetime(),
    }),
    // 紙の上端の小さい行。組織名と、資料の種類や日付
    signature: z
      .strictObject({ org: z.string(), note: z.string().optional() })
      .optional(),
    head: z.strictObject({ title: z.string(), lede: z.string().optional() }),
    summary: z
      .strictObject({ label: z.string().optional(), text: z.string() })
      .optional(),
    // 目次はセクションの見出しから作る。並びと位置はテンプレートの layout.areas が決める
    toc: z.enum(["auto", "none"]),
    sections: z.array(sectionSchema),
    aside: z
      .strictObject({
        label: z.string(),
        glossary: z.array(
          z.strictObject({ term: z.string(), description: z.string() }),
        ),
      })
      .optional(),
    foot: z
      .strictObject({
        org: z.string().optional(),
        showPage: z.boolean().optional(),
      })
      .optional(),
  })
  .superRefine((doc, ctx) => {
    const entries = collectIds(doc.sections);
    entries
      .filter(
        (entry, index) =>
          entries.findIndex((other) => other.id === entry.id) !== index,
      )
      .forEach((entry) => {
        ctx.addIssue({
          code: "custom",
          message: `id "${entry.id}" が文書内で重複している`,
          path: entry.path,
        });
      });
  });

export type DocumentFile = z.infer<typeof documentFileSchema>;

export type DocumentCheck =
  | { success: true; document: DocumentFile }
  | { success: false; message: string };

export const checkDocument = (input: unknown): DocumentCheck => {
  const result = documentFileSchema.safeParse(input);
  return result.success
    ? { success: true, document: result.data }
    : { success: false, message: z.prettifyError(result.error) };
};
