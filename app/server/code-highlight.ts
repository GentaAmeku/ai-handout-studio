import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import diff from "highlight.js/lib/languages/diff";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import go from "highlight.js/lib/languages/go";
import ini from "highlight.js/lib/languages/ini";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import kotlin from "highlight.js/lib/languages/kotlin";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import shell from "highlight.js/lib/languages/shell";
import sql from "highlight.js/lib/languages/sql";
import swift from "highlight.js/lib/languages/swift";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import { escapeHtml } from "./sheet-render.ts";

// code ブロックの構文の色分け。サーバーで class だけの <span> にし、色は design/document.css の
// .ds-hl-* が --color-code-* から引く。書き出した HTML・PDF・共有先でもスクリプト無しで同じ色になる。
// 言語は highlight.js の名前か別名(ts・js・sh・yml・html など)。ここに無い言語は色分けしない
const LANGUAGES = {
  bash,
  c,
  cpp,
  csharp,
  css,
  diff,
  dockerfile,
  go,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  php,
  python,
  ruby,
  rust,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
};

const highlighter = hljs.newInstance();
highlighter.configure({ classPrefix: "ds-hl-" });
Object.entries(LANGUAGES).forEach(([name, language]) => {
  highlighter.registerLanguage(name, language);
});

// highlight.js は下位の分類を「ds-hl-title class_」のように頭の無い class で出す。
// 文書の CSS は ds- の class だけを使う決まりなので「ds-hl-title ds-hl-title-class」に直す。
// 本文の字は highlight.js が " を逃がしているので、class="…" は highlight.js の出した所にしか無い
const prefixSubScopes = (html: string): string =>
  html.replace(
    /class="ds-hl-([\w-]+)((?: [\w-]+_+)+)"/g,
    (_match, scope: string, subScopes: string) =>
      `class="ds-hl-${scope}${subScopes
        .trim()
        .split(" ")
        .map((sub) => ` ds-hl-${scope}-${sub.replace(/_+$/, "")}`)
        .join("")}"`,
  );

// 自動で見分けた結果を採る下限。短い出力や日本語の文は当たりが弱く、誤った色を付けるより素のまま出す
const AUTO_MIN_RELEVANCE = 5;

export const isKnownCodeLanguage = (lang: string): boolean =>
  highlighter.getLanguage(lang.trim().toLowerCase()) !== undefined;

// 色分けした HTML。lang があればその言語、無ければ自動で見分け、どちらも外れたら字のまま逃がす
export const highlightCode = (text: string, lang?: string): string => {
  const name = lang?.trim().toLowerCase();
  if (name && isKnownCodeLanguage(name))
    return prefixSubScopes(
      highlighter.highlight(text, { language: name, ignoreIllegals: true })
        .value,
    );
  if (name) return escapeHtml(text);
  const auto = highlighter.highlightAuto(text);
  return auto.relevance >= AUTO_MIN_RELEVANCE
    ? prefixSubScopes(auto.value)
    : escapeHtml(text);
};
