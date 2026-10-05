import {
  type DefaultTreeAdapterTypes,
  defaultTreeAdapter,
  html as htmlSpec,
  type ParserError,
  parseFragment,
} from "parse5";

// HTML 資料の本文の断片(html ブロック・図・移行期の document.html)の検査。
// 書き出した HTML と共有の束には CSP が無いので、ここを通ったものはそのまま開いた人のブラウザで動く。
// そのため禁止リストではなく、HTML を解析して、許した要素・属性・URL だけを通す。
// 値は解析後(引用符と文字参照を解いたあと)で判定する

// 本文の上限。1枚で開く前提なので、これを超えるなら資料を分ける
export const DOCUMENT_BODY_LIMIT = 1_000_000;

// 要素の入れ子の上限。解析器は <div> などの開始タグのたびに、開いている要素を深さぶんたどる
// (<p> が開いていれば閉じる、という仕様の手順)。上限が無いと、深さ n の本文は n² に比例して遅くなる。
// Chromium と WebKit も 512 段より深い要素は入れ子にせず兄弟として置くので、それより深い本文は書いたとおりに出ない
export const DOCUMENT_BODY_DEPTH_LIMIT = 512;

export type BodyCheck = { success: true } | { success: false; message: string };

const fail = (message: string): BodyCheck => ({ success: false, message });

const HTML_NS: string = htmlSpec.NS.HTML;
const SVG_NS: string = htmlSpec.NS.SVG;
const XLINK_NS: string = htmlSpec.NS.XLINK;
const XMLNS_NS: string = htmlSpec.NS.XMLNS;

// 本文の部品(.ds-* で組む文章・表・図)に要る要素
const HTML_TAGS = new Set([
  "div",
  "section",
  "article",
  "header",
  "footer",
  "nav",
  "aside",
  "main",
  "p",
  "span",
  "br",
  "hr",
  "wbr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "a",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "mark",
  "sub",
  "sup",
  "abbr",
  "cite",
  "q",
  "dfn",
  "time",
  "del",
  "ins",
  "code",
  "pre",
  "kbd",
  "samp",
  "var",
  "blockquote",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "table",
  "caption",
  "colgroup",
  "col",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "figure",
  "figcaption",
  "img",
  "details",
  "summary",
  "svg",
]);

// 図の生成器(design/figure/render.mjs)と、手で描いた図が使う SVG の要素
const SVG_TAGS = new Set([
  "svg",
  "g",
  "defs",
  "title",
  "desc",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "path",
  "text",
  "tspan",
  "marker",
  "clipPath",
  "linearGradient",
  "radialGradient",
  "stop",
  "image",
  "a",
  "animate",
  "animateMotion",
  "animateTransform",
  "mpath",
]);

// 文章として読むだけの属性。中身は問わない
const isTextAttr = (name: string): boolean =>
  name === "alt" || name === "title" || name.startsWith("aria-");

const COMMON_ATTRS = new Set(["class", "id", "role", "lang", "dir"]);

const HTML_ATTRS = new Set([
  "href",
  "src",
  "width",
  "height",
  "colspan",
  "rowspan",
  "scope",
  "headers",
  "span",
  "start",
  "reversed",
  "open",
  "datetime",
]);

// SVG の形・文字・色・矢印・切り抜き・動きの属性
const SVG_ATTRS = new Set([
  "href",
  "viewBox",
  "preserveAspectRatio",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "fx",
  "fy",
  "d",
  "points",
  "pathLength",
  "transform",
  "dx",
  "dy",
  "rotate",
  "textLength",
  "lengthAdjust",
  "text-anchor",
  "dominant-baseline",
  "alignment-baseline",
  "baseline-shift",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "letter-spacing",
  "word-spacing",
  "text-decoration",
  "fill",
  "fill-opacity",
  "fill-rule",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-miterlimit",
  "opacity",
  "visibility",
  "display",
  "vector-effect",
  "paint-order",
  "shape-rendering",
  "text-rendering",
  "clip-path",
  "clip-rule",
  "clipPathUnits",
  "marker-start",
  "marker-mid",
  "marker-end",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "orient",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "spreadMethod",
  "attributeName",
  "attributeType",
  "type",
  "dur",
  "begin",
  "end",
  "min",
  "max",
  "restart",
  "repeatCount",
  "repeatDur",
  "values",
  "keyTimes",
  "keySplines",
  "keyPoints",
  "calcMode",
  "from",
  "to",
  "by",
  "additive",
  "accumulate",
  "path",
]);

// <animate> などで動かしてよい属性。href や class を書き換えてリンク先を差し替えさせない
const ANIMATABLE = new Set([
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-dashoffset",
  "opacity",
  "visibility",
  "display",
  "width",
  "height",
  "x",
  "y",
  "x1",
  "y1",
  "x2",
  "y2",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "dx",
  "dy",
  "d",
  "points",
  "transform",
  "font-size",
  "offset",
  "stop-color",
  "stop-opacity",
]);

const LINK_PREFIXES = ["#", "https:", "http:", "mailto:"];
// 画像は本文に埋め込む。svg+xml は共有の束で別ファイルになり、直接開くとスクリプトが動きうるので通さない
const IMAGE_DATA = /^data:image\/(?:png|jpeg|gif|webp)[;,]/i;
// url() が指せるのは同じ本文の中の id だけ(矢印の頭・切り抜き)
const URL_FUNCTION = /url\s*\(/gi;
const LOCAL_URL = /url\s*\(\s*(['"]?)#[^'"()\s\\]+\1\s*\)/gi;

const preview = (value: string): string =>
  value.length > 40 ? `${value.slice(0, 40)}…` : value;

const isLink = (value: string): boolean => {
  const url = value.trim().toLowerCase();
  return LINK_PREFIXES.some((prefix) => url.startsWith(prefix));
};

const IMAGE_MESSAGE =
  "本文の画像は data: の png・jpeg・gif・webp で埋め込む(外から読む src や data:image/svg+xml は書けない)";

type Element = DefaultTreeAdapterTypes.Element;
type Attribute = Element["attrs"][number];

// href と src の行き先。要素ごとに、リンクか埋め込みの画像か、本文の中の参照かが決まる
const checkUrl = (
  element: Element,
  name: string,
  value: string,
): string | undefined => {
  const svg = element.namespaceURI === SVG_NS;
  if (name === "src") {
    if (svg || element.tagName !== "img")
      return `本文の <${element.tagName}> に src の属性は書けない`;
    return IMAGE_DATA.test(value.trim()) ? undefined : IMAGE_MESSAGE;
  }
  if (svg && element.tagName === "image") {
    return IMAGE_DATA.test(value.trim()) ? undefined : IMAGE_MESSAGE;
  }
  if (element.tagName === "a") {
    return isLink(value)
      ? undefined
      : `本文のリンクは #・https:・http:・mailto: だけにする: ${preview(value)}`;
  }
  if (svg) {
    return value.trim().startsWith("#")
      ? undefined
      : `本文の <${element.tagName}> の href は本文の中の #id だけを指す: ${preview(value)}`;
  }
  return `本文の <${element.tagName}> に href の属性は書けない`;
};

// 形・色などの値。CSS として読まれうるので、外を指す url() とエスケープを持ち込ませない
const checkValue = (name: string, value: string): string | undefined => {
  if (value.includes("\\")) return `本文の ${name} の属性に \\ は書けない`;
  const urls = value.match(URL_FUNCTION)?.length ?? 0;
  const local = value.match(LOCAL_URL)?.length ?? 0;
  return urls === local
    ? undefined
    : `本文の ${name} の url() が指せるのは本文の中の #id だけ: ${preview(value)}`;
};

const checkNamespacedAttr = (attr: Attribute): string | undefined => {
  const declares =
    attr.namespace === XMLNS_NS &&
    ((attr.name === "xmlns" && attr.value === SVG_NS) ||
      (attr.name === "xlink" && attr.value === XLINK_NS));
  if (declares) return undefined;
  const name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
  return `本文に ${name} の属性は書けない(リンクと画像は href・src で書く)`;
};

const checkAttr = (element: Element, attr: Attribute): string | undefined => {
  if (attr.namespace) return checkNamespacedAttr(attr);
  const { name, value } = attr;
  const tag = element.tagName;
  if (name.startsWith("on")) {
    return `本文に on… の属性は書けない(<${tag} ${name}>)`;
  }
  if (name === "style") {
    return "本文に style の属性は書けない。見た目は .ds-* の部品とテンプレートが決める";
  }
  if (name === "class") {
    const bad = value
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .find((part) => !part.startsWith("ds-"));
    return bad
      ? `本文の class は ds- で始まるものだけにする: ${bad}`
      : undefined;
  }
  if (isTextAttr(name)) return undefined;
  const allowed =
    COMMON_ATTRS.has(name) ||
    (element.namespaceURI === SVG_NS ? SVG_ATTRS : HTML_ATTRS).has(name);
  if (!allowed) return `本文の <${tag}> に ${name} の属性は書けない`;
  if (name === "href" || name === "src") return checkUrl(element, name, value);
  if (name === "attributeName" && !ANIMATABLE.has(value)) {
    return `本文の <${tag}> で動かせるのは形と色の属性だけ: ${preview(value)}`;
  }
  return checkValue(name, value);
};

const isElement = (node: DefaultTreeAdapterTypes.Node): node is Element =>
  "tagName" in node;

const tagAllowed = (element: Element): boolean =>
  element.namespaceURI === HTML_NS
    ? HTML_TAGS.has(element.tagName)
    : element.namespaceURI === SVG_NS && SVG_TAGS.has(element.tagName);

// 閉じていない <svg> は、後ろに続くページの部品まで SVG として読ませてしまう
const svgLeftOpen = (element: Element, html: string): boolean => {
  const location = element.sourceCodeLocation;
  if (!location?.startTag || location.endTag) return false;
  return (
    html.slice(location.startTag.endOffset - 2, location.startTag.endOffset) !==
    "/>"
  );
};

const checkElement = (
  element: Element,
  parentNamespace: string,
  html: string,
): string | undefined => {
  if (!tagAllowed(element)) {
    return `本文に <${element.tagName}> は書けない。本文だけの断片を .ds-* の部品で組む`;
  }
  const badAttr = element.attrs
    .map((attr) => checkAttr(element, attr))
    .find((message) => message !== undefined);
  if (badAttr) return badAttr;
  return element.tagName === "svg" &&
    parentNamespace === HTML_NS &&
    svgLeftOpen(element, html)
    ? "本文の <svg> が閉じていない。</svg> で閉じる"
    : undefined;
};

// 木を深さ優先でたどり、最初に見つかった問題を返す。深い入れ子でも落ちないよう、再帰せずに積んで回す
const firstProblem = (
  root: DefaultTreeAdapterTypes.DocumentFragment,
  html: string,
): string | undefined => {
  const stack: Array<[DefaultTreeAdapterTypes.ChildNode, string]> =
    root.childNodes
      .map((node): [DefaultTreeAdapterTypes.ChildNode, string] => [
        node,
        HTML_NS,
      ])
      .reverse();
  while (stack.length > 0) {
    const [node, parentNamespace] = stack.pop() as [
      DefaultTreeAdapterTypes.ChildNode,
      string,
    ];
    if (node.nodeName === "#comment") {
      return "本文に HTML のコメント(<!-- … -->)は書けない。画面に出なくても書き出しや共有の先では読めるので、消す";
    }
    if (isElement(node)) {
      const problem = checkElement(node, parentNamespace, html);
      if (problem) return problem;
      // 子が何万あっても引数の上限に当たらないよう、1つずつ積む
      for (const child of [...node.childNodes].reverse()) {
        stack.push([child, node.namespaceURI]);
      }
    }
  }
  return undefined;
};

// ページの枠は解析で読み捨てられて木に残らないので、字面で見て分かる言葉で止める
const FRAME_TAG = /<(html|head|body)[\s/>]/i;

const TOO_DEEP = new Error("本文の入れ子が深すぎる");

// 本文を <div> の中に置いたものとして読む。入れ子が上限を超えたら、そこで解析をやめて undefined を返す
const parseBody = (
  html: string,
  errors: ParserError[],
): DefaultTreeAdapterTypes.DocumentFragment | undefined => {
  // 開いている要素の数。断片の解析は根の <html> を1つ積んでから始まる
  const open = { depth: -1 };
  const treeAdapter: typeof defaultTreeAdapter = {
    ...defaultTreeAdapter,
    onItemPush: () => {
      open.depth += 1;
      if (open.depth > DOCUMENT_BODY_DEPTH_LIMIT) throw TOO_DEEP;
    },
    onItemPop: () => {
      open.depth -= 1;
    },
  };
  const context = treeAdapter.createElement("div", htmlSpec.NS.HTML, []);
  try {
    return parseFragment(context, html, {
      treeAdapter,
      sourceCodeLocationInfo: true,
      onParseError: (error) => errors.push(error),
    });
  } catch (error) {
    if (error === TOO_DEEP) return undefined;
    throw error;
  }
};

export const checkDocumentBody = (html: string): BodyCheck => {
  if (html.trim().length === 0) return fail("本文が空");
  if (html.length > DOCUMENT_BODY_LIMIT) {
    return fail(`本文が大きすぎる(${DOCUMENT_BODY_LIMIT} 文字まで)`);
  }
  const frame = html.match(FRAME_TAG)?.[1];
  if (frame) {
    return fail(
      `本文に <${frame.toLowerCase()}> は書けない。本文だけの断片を .ds-* の部品で組む`,
    );
  }
  const errors: ParserError[] = [];
  // 資料では本文を <div> の中に置くので、同じ文脈で読む
  const fragment = parseBody(html, errors);
  if (!fragment) {
    return fail(
      `本文の入れ子が深すぎる(${DOCUMENT_BODY_DEPTH_LIMIT} 段まで)。部品の入れ子を浅くする`,
    );
  }
  // タグや引用符が開いたまま終わると、後ろに続くページの部品を巻き込んで読まれる
  if (errors.some((error) => error.code.startsWith("eof-in-"))) {
    return fail("本文の終わりでタグか引用符が閉じていない");
  }
  const problem = firstProblem(fragment, html);
  return problem ? fail(problem) : { success: true };
};
