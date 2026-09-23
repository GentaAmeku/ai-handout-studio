import type { Connect } from "vite";

// 画面がブラウザに残すもの(質問票の入力。localStorage)はアドレスごとに分かれる。
// localhost で開いた画面と、コマンドが返す 127.0.0.1 の画面で別々にならないよう、
// localhost へ来た要求は同じ道の 127.0.0.1 へ送り直す
export const loopbackLocationOf = (
  host: string | undefined,
  url: string | undefined,
): string | undefined => {
  const match = /^localhost(:\d+)?$/i.exec(host ?? "");
  return match ? `http://127.0.0.1${match[1] ?? ""}${url ?? "/"}` : undefined;
};

export const toLoopbackAddress: Connect.NextHandleFunction = (
  req,
  res,
  next,
) => {
  const location = loopbackLocationOf(req.headers.host, req.url);
  if (!location) return next();
  // 307 は POST なども中身ごと送り直す
  res.statusCode = 307;
  res.setHeader("location", location);
  res.end();
};
