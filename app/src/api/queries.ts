import {
  type QueryKey,
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Deck } from "../schema/deck";
import type { Selection, Surface, Template } from "../schema/design";
import type { DocumentFile } from "../schema/document";
import type { Profile } from "../schema/profile";
import { deckApiPath, requestJson } from "./client";
import type {
  AgentId,
  AgentRunStatus,
  AiPatchStatus,
  AiRequestDetail,
  DeckDetail,
  DeckSummary,
  DesignBuildResult,
  DesignTemplateDetail,
  DesignTemplateSampleDetail,
  DesignTemplatesDetail,
  DocumentAiPatchStatus,
  DocumentVersionDetail,
  ExportFormat,
  ExportResult,
  FavoriteResult,
  HandoutDetail,
  HandoutExportResult,
  HandoutKind,
  HandoutSummary,
  ProfileDetail,
  ShareApiResult,
  VersionDetail,
  VersionSummary,
  WithFavorite,
} from "./types";

export const decksQuery = queryOptions({
  queryKey: ["decks"],
  queryFn: () => requestJson<WithFavorite<DeckSummary>[]>("/api/decks"),
});

export const deckQuery = (deckId: string) =>
  queryOptions({
    queryKey: ["decks", deckId],
    queryFn: () => requestJson<DeckDetail>(deckApiPath(deckId)),
  });

export const profileQuery = queryOptions({
  queryKey: ["profile"],
  queryFn: () => requestJson<ProfileDetail>("/api/profile"),
});

export const useSaveProfile = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profile: Profile) =>
      requestJson<ProfileDetail>("/api/profile", {
        method: "PUT",
        body: JSON.stringify(profile),
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(profileQuery.queryKey, detail);
    },
  });
};

export const useExportDeck = (deckId: string) =>
  useMutation({
    mutationFn: (format: ExportFormat) =>
      requestJson<ExportResult>(`${deckApiPath(deckId)}/exports`, {
        method: "POST",
        body: JSON.stringify({ format }),
      }),
  });

export const useDeleteDeck = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (deckId: string) =>
      requestJson<{ deckId: string }>(deckApiPath(deckId), {
        method: "DELETE",
      }),
    onSuccess: (detail) => {
      queryClient.removeQueries({
        queryKey: deckQuery(detail.deckId).queryKey,
      });
      return queryClient.invalidateQueries({ queryKey: decksQuery.queryKey });
    },
  });
};

// 保存の完了は onSaved で先に画面の状態へ伝え、同じ更新の中でキャッシュも揃える
export const useSaveDeck = (
  deckId: string,
  onSaved: (deck: Deck, sent: Deck) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { deck: Deck; baseUpdatedAt: string }) =>
      requestJson<DeckDetail>(deckApiPath(deckId), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (detail, input) => {
      if (detail.state !== "ready") return;
      onSaved(detail.deck, input.deck);
      queryClient.setQueryData(deckQuery(deckId).queryKey, detail);
      return queryClient.invalidateQueries({
        queryKey: decksQuery.queryKey,
        exact: true,
      });
    },
  });
};

// AI の編集案。依頼のあとは、パッチが届くまで数秒おきに確かめる
export const aiPatchQuery = (deckId: string, requestId: string) =>
  queryOptions({
    queryKey: ["decks", deckId, "ai", requestId],
    queryFn: () =>
      requestJson<AiPatchStatus>(
        `${deckApiPath(deckId)}/ai-requests/${encodeURIComponent(requestId)}`,
      ),
  });

export const useCreateAiRequest = (deckId: string) =>
  useMutation({
    mutationFn: (input: {
      scope: "slide" | "deck";
      slideId?: string;
      instruction: string;
      target: unknown;
    }) =>
      requestJson<AiRequestDetail>(`${deckApiPath(deckId)}/ai-requests`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });

// エージェントの起動(試作)。実行中は数秒おきに確かめる
export const agentRunQuery = (
  deckId: string,
  requestId: string,
  runId: string,
) =>
  queryOptions({
    queryKey: ["decks", deckId, "ai", requestId, "runs", runId],
    queryFn: () =>
      requestJson<AgentRunStatus>(
        `${deckApiPath(deckId)}/ai-requests/${encodeURIComponent(requestId)}/runs/${encodeURIComponent(runId)}`,
      ),
  });

export const useStartAgentRun = (deckId: string, requestId: string) =>
  useMutation({
    mutationFn: (agent: AgentId) =>
      requestJson<AgentRunStatus>(
        `${deckApiPath(deckId)}/ai-requests/${encodeURIComponent(requestId)}/runs`,
        { method: "POST", body: JSON.stringify({ agent }) },
      ),
  });

export const useCancelAgentRun = (deckId: string, requestId: string) =>
  useMutation({
    mutationFn: (runId: string) =>
      requestJson<AgentRunStatus>(
        `${deckApiPath(deckId)}/ai-requests/${encodeURIComponent(requestId)}/runs/${encodeURIComponent(runId)}/cancel`,
        { method: "POST" },
      ),
  });

export const versionsQuery = (deckId: string) =>
  queryOptions({
    queryKey: ["decks", deckId, "versions"],
    queryFn: () =>
      requestJson<VersionSummary[]>(`${deckApiPath(deckId)}/versions`),
  });

export const versionQuery = (deckId: string, versionId: string) =>
  queryOptions({
    queryKey: ["decks", deckId, "versions", versionId],
    queryFn: () =>
      requestJson<VersionDetail>(
        `${deckApiPath(deckId)}/versions/${encodeURIComponent(versionId)}`,
      ),
    // 版のファイルは増えるだけで、中身は変わらない
    staleTime: Number.POSITIVE_INFINITY,
  });

export const useRestoreVersion = (
  deckId: string,
  onRestored: (deck: Deck) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      requestJson<DeckDetail>(
        `${deckApiPath(deckId)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: "POST" },
      ),
    onSuccess: (detail) => {
      if (detail.state !== "ready") return;
      onRestored(detail.deck);
      queryClient.setQueryData(deckQuery(deckId).queryKey, detail);
      return queryClient.invalidateQueries({ queryKey: ["decks"] });
    },
  });
};

// デザイン: テンプレートの一覧・取得・保存。保存は template.json を書いてから build まで回す
export const designTemplatesQuery = queryOptions({
  queryKey: ["design", "templates"],
  queryFn: () => requestJson<DesignTemplatesDetail>("/api/design/templates"),
});

const templateApiPath = (surface: Surface, name: string) =>
  `/api/design/templates/${surface}/${encodeURIComponent(name)}`;

export const designTemplateQuery = (surface: Surface, name: string) =>
  queryOptions({
    queryKey: ["design", "templates", surface, name],
    queryFn: () =>
      requestJson<DesignTemplateDetail>(templateApiPath(surface, name)),
  });

// テンプレートが持つ中身の見本。一覧のカードと編集画面が描く。持たないテンプレートは sample が null
export const designTemplateSampleQuery = (surface: Surface, name: string) =>
  queryOptions({
    queryKey: ["design", "templates", surface, name, "sample"],
    queryFn: () =>
      requestJson<DesignTemplateSampleDetail>(
        `${templateApiPath(surface, name)}/sample`,
      ),
  });

export type SaveDesignTemplateInput = {
  surface: Surface;
  name: string;
  template: Template;
  create?: boolean;
  // 複製の元。スライドは元の中身の見本も写す
  source?: string;
};

export const useSaveDesignTemplate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      surface,
      name,
      template,
      create,
      source,
    }: SaveDesignTemplateInput) => {
      const saved = await requestJson<DesignTemplateDetail>(
        templateApiPath(surface, name),
        { method: "PUT", body: JSON.stringify({ template, create, source }) },
      );
      const built = await requestJson<DesignBuildResult>("/api/design/build", {
        method: "POST",
      });
      return { saved, built };
    },
    onSuccess: ({ saved }) => {
      queryClient.setQueryData(
        designTemplateQuery(saved.surface, saved.name).queryKey,
        saved,
      );
      void queryClient.invalidateQueries({
        queryKey: designTemplatesQuery.queryKey,
        exact: true,
      });
    },
  });
};

// 区分ごとの既定のテンプレート。選択を書いてから build し、区分の tokens.css を作り直す
export const useSaveDesignSelection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (selection: Selection) => {
      const saved = await requestJson<Selection>("/api/design/selection", {
        method: "PUT",
        body: JSON.stringify(selection),
      });
      await requestJson<DesignBuildResult>("/api/design/build", {
        method: "POST",
      });
      return saved;
    },
    onSuccess: (selection) => {
      queryClient.setQueryData<DesignTemplatesDetail>(
        designTemplatesQuery.queryKey,
        (current) => current && { ...current, selection },
      );
    },
  });
};

// 質問票と HTML 資料。中身は AI が CLI で置く。画面は一覧・見本・テンプレート・書き出しだけ
const handoutBase: Record<HandoutKind, string> = {
  sheet: "/api/sheets",
  document: "/api/documents",
};

export const handoutApiPath = (kind: HandoutKind, id: string): string =>
  `${handoutBase[kind]}/${encodeURIComponent(id)}`;

// 見本の iframe が読む1枚の HTML。書き出すものと同じ
export const handoutPreviewUrl = (kind: HandoutKind, id: string): string =>
  `${handoutApiPath(kind, id)}/preview`;

export const handoutsQuery = (kind: HandoutKind) =>
  queryOptions({
    queryKey: ["handouts", kind],
    queryFn: () =>
      requestJson<WithFavorite<HandoutSummary>[]>(handoutBase[kind]),
  });

export const handoutQuery = (kind: HandoutKind, id: string) =>
  queryOptions({
    queryKey: ["handouts", kind, id],
    queryFn: () => requestJson<HandoutDetail>(handoutApiPath(kind, id)),
  });

export const useSetHandoutTemplate = (kind: HandoutKind, id: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (template: string) =>
      requestJson<HandoutDetail>(`${handoutApiPath(kind, id)}/template`, {
        method: "PUT",
        body: JSON.stringify({ template }),
      }),
    onSuccess: (detail) => {
      queryClient.setQueryData(handoutQuery(kind, id).queryKey, detail);
      return queryClient.invalidateQueries({
        queryKey: handoutsQuery(kind).queryKey,
      });
    },
  });
};

// HTML 資料の中身。正本は document.json で、画面はこれを読んで直して保存する。
// 保存の応答は資料の概要なので、書き戻された title・template・更新日時を下書きに写して次の base にする
const documentPath = (id: string): string => handoutApiPath("document", id);

export const documentQuery = (id: string) =>
  queryOptions({
    queryKey: ["handouts", "document", id, "document"],
    queryFn: () => requestJson<DocumentFile>(`${documentPath(id)}/document`),
  });

export const savedDocument = (
  sent: DocumentFile,
  summary: HandoutSummary,
): DocumentFile => ({
  ...sent,
  title: summary.title,
  template: summary.template,
  meta: { ...sent.meta, updatedAt: summary.updatedAt },
});

export const useSaveDocument = (
  id: string,
  onSaved: (document: DocumentFile, sent: DocumentFile) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { document: DocumentFile; baseUpdatedAt: string }) =>
      requestJson<HandoutSummary>(documentPath(id), {
        method: "PUT",
        body: JSON.stringify(input),
      }),
    onSuccess: (summary, input) => {
      const saved = savedDocument(input.document, summary);
      onSaved(saved, input.document);
      queryClient.setQueryData(documentQuery(id).queryKey, saved);
      queryClient.setQueryData(handoutQuery("document", id).queryKey, summary);
      return queryClient.invalidateQueries({
        queryKey: handoutsQuery("document").queryKey,
      });
    },
  });
};

export const documentVersionsQuery = (id: string) =>
  queryOptions({
    queryKey: ["handouts", "document", id, "versions"],
    queryFn: () =>
      requestJson<VersionSummary[]>(`${documentPath(id)}/versions`),
  });

export const documentVersionQuery = (id: string, versionId: string) =>
  queryOptions({
    queryKey: ["handouts", "document", id, "versions", versionId],
    queryFn: () =>
      requestJson<DocumentVersionDetail>(
        `${documentPath(id)}/versions/${encodeURIComponent(versionId)}`,
      ),
    // 版のファイルは増えるだけで、中身は変わらない
    staleTime: Number.POSITIVE_INFINITY,
  });

// 復元も新しい版として残る。応答は復元した文書そのもの
export const useRestoreDocumentVersion = (
  id: string,
  onRestored: (document: DocumentFile) => void,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      requestJson<DocumentFile>(
        `${documentPath(id)}/versions/${encodeURIComponent(versionId)}/restore`,
        { method: "POST" },
      ),
    onSuccess: (document) => {
      onRestored(document);
      queryClient.setQueryData(documentQuery(id).queryKey, document);
      return queryClient.invalidateQueries({ queryKey: ["handouts"] });
    },
  });
};

export const useExportHandout = (kind: HandoutKind, id: string) =>
  useMutation({
    mutationFn: () =>
      requestJson<HandoutExportResult>(`${handoutApiPath(kind, id)}/exports`, {
        method: "POST",
      }),
  });

// 画面の「共有の依頼をコピー」。束を作り直し、Claude Code への依頼文を返す
export const useShareHandout = (kind: HandoutKind, id: string) =>
  useMutation({
    mutationFn: () =>
      requestJson<ShareApiResult>(`${handoutApiPath(kind, id)}/share`, {
        method: "POST",
      }),
  });

// お気に入りの付け外し。押したらすぐ一覧の控えの印を替え、失敗したら元に戻す。
// 一覧の控えは完全一致の鍵で触る(["decks"] は資料1件の控えの頭でもある)
const useSetFavorite = <T extends { favorite: boolean }>(
  queryKey: QueryKey,
  idOf: (item: T) => string,
) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, favorite }: FavoriteResult) =>
      requestJson<FavoriteResult>(`/api/favorites/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify({ favorite }),
      }),
    onMutate: async ({ id, favorite }) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const previous = queryClient.getQueryData<T[]>(queryKey);
      queryClient.setQueryData<T[]>(queryKey, (items) =>
        items?.map((item) =>
          idOf(item) === id ? { ...item, favorite } : item,
        ),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey, exact: true }),
  });
};

export const useSetDeckFavorite = () =>
  useSetFavorite(
    decksQuery.queryKey,
    (deck: WithFavorite<DeckSummary>) => deck.deckId,
  );

export const useSetHandoutFavorite = (kind: HandoutKind) =>
  useSetFavorite(
    handoutsQuery(kind).queryKey,
    (summary: WithFavorite<HandoutSummary>) => summary.id,
  );

export const useDeleteHandout = (kind: HandoutKind) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      requestJson<{ id: string }>(handoutApiPath(kind, id), {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      queryClient.removeQueries({
        queryKey: handoutQuery(kind, result.id).queryKey,
      });
      return queryClient.invalidateQueries({
        queryKey: handoutsQuery(kind).queryKey,
      });
    },
  });
};

// HTML 資料の AI の編集案。依頼はセクションを指し、案は取り込む前にプレビューで見比べる
export const documentAiPatchQuery = (id: string, requestId: string) =>
  queryOptions({
    queryKey: ["handouts", "document", id, "ai", requestId],
    queryFn: () =>
      requestJson<DocumentAiPatchStatus>(
        `${handoutApiPath("document", id)}/ai-requests/${encodeURIComponent(requestId)}`,
      ),
  });

export const documentAiPreviewUrl = (
  id: string,
  requestId: string,
  view: "before" | "after",
): string =>
  `${handoutApiPath("document", id)}/ai-requests/${encodeURIComponent(requestId)}/preview?view=${view}`;

export const useCreateDocumentAiRequest = (id: string) =>
  useMutation({
    mutationFn: (input: {
      sectionId: string;
      instruction: string;
      target: unknown;
    }) =>
      requestJson<AiRequestDetail>(
        `${handoutApiPath("document", id)}/ai-requests`,
        { method: "POST", body: JSON.stringify(input) },
      ),
  });
