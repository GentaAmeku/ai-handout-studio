import type { IncomingMessage, ServerResponse } from "node:http";
import type { Connect } from "vite";

// 手元の API の守り。開発サーバーとプレビューサーバーの全ての要求が、API より前にここを通る。
// - 書き込み(GET・HEAD・OPTIONS 以外)は、アプリを動かしている PC の画面とコマンドからだけ受ける。
//   別のサイトからの書き込み(CSRF)と、LAN の起動(--lan)でほかの端末から来た書き込みを断る
// - 読むだけの GET は、LAN からも別のサイトからも今までどおり通す(スマホで読む画面のため)
// - GET でも動きを起こす口(SIDE_EFFECT_GET_PATHS)は、書き込みと同じに送り手と Origin を確かめる

export const LOCAL_ONLY_CODE = "local-only";
export const LOCAL_ONLY_MESSAGE =
  "この操作は、アプリを動かしている PC の画面から行ってください";
export const JSON_ONLY_CODE = "json-only";
export const JSON_ONLY_MESSAGE =
  "本文は JSON(Content-Type: application/json)で送ってください";

// 読むだけの方法。これ以外は全て書き込みとして扱う
const SAFE_METHODS: readonly string[] = ["GET", "HEAD", "OPTIONS"];

// 読むだけの方法で来ても動きを起こす口。アプリの API(/api/)の GET は全て読むだけ
// (request-guard.test.ts が経路の一覧で確かめる)。Vite の開発サーバーが持つ
// /__open-in-editor は、GET でエディターのプロセスを起こすので書き込みと同じに扱う
export const SIDE_EFFECT_GET_PATHS: readonly string[] = ["/__open-in-editor"];

// 書き込みの本文の形。どの書き込みの口も JSON だけを読む(アップロードの口は無い)
const JSON_MEDIA_TYPE = "application/json";

export type GuardRequest = {
  method: string | undefined;
  url: string | undefined;
  remoteAddress: string | undefined;
  headers: {
    host?: string | undefined;
    origin?: string | undefined;
    "sec-fetch-site"?: string | undefined;
    "content-type"?: string | undefined;
  };
  // 待ち受けの形。このアプリは http で待ち受ける
  protocol?: "http:" | "https:";
};

export type GuardVerdict =
  | { allowed: true }
  | {
      allowed: false;
      status: 403 | 415;
      code: typeof LOCAL_ONLY_CODE | typeof JSON_ONLY_CODE;
      message: string;
    };

const ALLOWED: GuardVerdict = { allowed: true };

const localOnly: GuardVerdict = {
  allowed: false,
  status: 403,
  code: LOCAL_ONLY_CODE,
  message: LOCAL_ONLY_MESSAGE,
};

const jsonOnly: GuardVerdict = {
  allowed: false,
  status: 415,
  code: JSON_ONLY_CODE,
  message: JSON_ONLY_MESSAGE,
};

// ループバック(127.0.0.0/8・::1・IPv4 を写した IPv6 の 127.0.0.0/8)
export const isLoopbackAddress = (address: string | undefined): boolean => {
  if (address === undefined) return false;
  const v4 = address.toLowerCase().replace(/^::ffff:/, "");
  return address === "::1" || /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(v4);
};

// Origin が無い要求(コマンド・curl・同じ origin の GET)は通す。
// あれば、要求が来た Host と同じ origin のときだけ通す。"null"(file: や sandbox)は断る
export const isSameOrigin = (
  origin: string | undefined,
  host: string | undefined,
  protocol: "http:" | "https:" = "http:",
): boolean => {
  if (origin === undefined) return true;
  if (host === undefined || host === "") return false;
  try {
    const from = new URL(origin);
    const self = new URL(`${protocol}//${host}`);
    return from.origin === self.origin;
  } catch {
    return false;
  }
};

const isSameOriginFetch = (secFetchSite: string | undefined): boolean =>
  secFetchSite === undefined || secFetchSite === "same-origin";

const isJson = (contentType: string | undefined): boolean =>
  contentType?.split(";")[0]?.trim().toLowerCase() === JSON_MEDIA_TYPE;

// 要求の道(pathname)。"/" で始まる形は ? と # の前まで。絶対形式(http://host/path)は URL で直す。
// 読めない形は undefined(動きを起こす口とみなして断る側に倒す)
const pathOf = (url: string | undefined): string | undefined => {
  const raw = url ?? "/";
  if (raw.startsWith("/")) return raw.split(/[?#]/)[0] ?? "/";
  try {
    return new URL(raw).pathname;
  } catch {
    return undefined;
  }
};

// Vite が使う connect の口の照合と同じ規則で比べる。大文字小文字を区別せず、
// 口の名前の次の文字が無いか "/" か "." なら一致する(connect は /__open-in-editor.x も同じ口へ渡す)
const matchesRoute = (path: string, route: string): boolean => {
  const lower = path.toLowerCase();
  const prefix = route.toLowerCase();
  if (!lower.startsWith(prefix)) return false;
  const next = lower.charAt(prefix.length);
  return next === "" || next === "/" || next === ".";
};

const isSideEffectGet = (url: string | undefined): boolean => {
  const path = pathOf(url);
  if (path === undefined) return true;
  return SIDE_EFFECT_GET_PATHS.some((route) => matchesRoute(path, route));
};

// 送り手と、ブラウザが付ける出どころの印を確かめる
const fromThisPc = (request: GuardRequest): boolean =>
  isLoopbackAddress(request.remoteAddress) &&
  isSameOriginFetch(request.headers["sec-fetch-site"]) &&
  isSameOrigin(
    request.headers.origin,
    request.headers.host,
    request.protocol ?? "http:",
  );

export const checkRequest = (request: GuardRequest): GuardVerdict => {
  const method = (request.method ?? "GET").toUpperCase();
  if (SAFE_METHODS.includes(method)) {
    if (method === "OPTIONS" || !isSideEffectGet(request.url)) return ALLOWED;
    return fromThisPc(request) ? ALLOWED : localOnly;
  }
  if (!fromThisPc(request)) return localOnly;
  return isJson(request.headers["content-type"]) ? ALLOWED : jsonOnly;
};

const headerOf = (req: IncomingMessage, name: string): string | undefined => {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(", ") : value;
};

export const guardRequestOf = (req: IncomingMessage): GuardRequest => ({
  method: req.method,
  url: req.url,
  remoteAddress: req.socket.remoteAddress,
  headers: {
    host: headerOf(req, "host"),
    origin: headerOf(req, "origin"),
    "sec-fetch-site": headerOf(req, "sec-fetch-site"),
    "content-type": headerOf(req, "content-type"),
  },
  protocol:
    "encrypted" in req.socket && req.socket.encrypted ? "https:" : "http:",
});

// 断るときは API のエラーと同じ形({ error })で返す。code は画面が訳すための印
export const guardLocalRequests: Connect.NextHandleFunction = (
  req,
  res: ServerResponse,
  next,
) => {
  const verdict = checkRequest(guardRequestOf(req));
  if (verdict.allowed) return next();
  res.statusCode = verdict.status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify({ error: verdict.message, code: verdict.code }));
};
