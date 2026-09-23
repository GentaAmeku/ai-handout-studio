import { translate } from "../i18n/language";
import type { ApiErrorBody } from "./types";

// サーバーの守り(app/server/request-guard.ts)が付ける印
const LOCAL_ONLY_CODE = "local-only";

const readErrorMessage = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as Partial<ApiErrorBody>;
    if (body.code === LOCAL_ONLY_CODE) return translate("api.localOnly");
    return body.error ?? response.statusText;
  } catch {
    return response.statusText;
  }
};

export type ApiError = Error & { status: number };

const apiError = (message: string, status: number): ApiError =>
  Object.assign(new Error(message), { status });

export const errorStatus = (error: unknown): number | undefined =>
  error instanceof Error &&
  "status" in error &&
  typeof error.status === "number"
    ? error.status
    : undefined;

// 応答の中身はサーバーが同じスキーマで検証済み。ここでは形を信じて型を付ける
export const requestJson = async <T>(
  path: string,
  init?: RequestInit,
): Promise<T> => {
  const response = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    throw apiError(await readErrorMessage(response), response.status);
  }
  return (await response.json()) as T;
};

export const deckApiPath = (deckId: string): string =>
  `/api/decks/${encodeURIComponent(deckId)}`;

// 資料の画像は assets/ からの相対パス。描画側はこの基点に連結する
export const deckAssetBase = deckApiPath;
