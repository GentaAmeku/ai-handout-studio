import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { type ReactNode, useState } from "react";
import { deckAssetBase } from "../../api/client";
import {
  useRestoreVersion,
  versionQuery,
  versionsQuery,
} from "../../api/queries";
import type { VersionSummary } from "../../api/types";
import { Dialog } from "../../components/Dialog";
import { ScaledSlide } from "../../components/ScaledSlide";
import { useLanguage } from "../../i18n/language";
import { type Deck, deckTemplate } from "../../schema/deck";

export const formatSavedAt = (savedAt: string): string => {
  const date = new Date(savedAt);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const VersionRow = ({
  version,
  amount,
  selected,
  onSelect,
}: {
  version: VersionSummary;
  amount: string;
  selected: boolean;
  onSelect: () => void;
}) => {
  const { t } = useLanguage();
  return (
    <li>
      <button
        type="button"
        className="version-row"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
      >
        <span className="version-row__time">
          {version.savedAt === ""
            ? t("history.unknownDate")
            : formatSavedAt(version.savedAt)}
        </span>
        <span className="version-row__title">
          {version.error ?? version.title}
        </span>
        <span className="version-row__meta">
          {version.source === "generated"
            ? t("history.sourceGenerated")
            : t("history.sourceSave")}
          {amount}
        </span>
      </button>
    </li>
  );
};

// 版の一覧・見本・復元の枠。資料の区分ごとに、版の数え方と見本の描き方だけを渡す。
// 復元はファイルに対して行い、現行を versions/ へ残す
export const HistoryDialogShell = ({
  open,
  dirty,
  versions,
  amount,
  preview,
  restore,
  onClose,
}: {
  open: boolean;
  dirty: boolean;
  versions: UseQueryResult<VersionSummary[]>;
  amount: (version: VersionSummary) => string;
  preview: (versionId: string) => ReactNode;
  restore: {
    mutate: (versionId: string) => void;
    isPending: boolean;
    error: Error | null;
  };
  onClose: () => void;
}) => {
  const [selectedId, setSelectedId] = useState<string>();
  const { t } = useLanguage();

  const list = versions.data ?? [];
  const selected = list.find((version) => version.versionId === selectedId);

  const confirmRestore = () => {
    if (!selected) return;
    if (dirty && !window.confirm(t("history.restoreConfirm"))) {
      return;
    }
    restore.mutate(selected.versionId);
  };

  return (
    <Dialog open={open} onClose={onClose} title={t("history.title")}>
      <div className="history">
        <p className="prop-panel__hint">{t("history.lead")}</p>
        {versions.isPending && (
          <p className="state-message">{t("common.loading")}</p>
        )}
        {versions.isError && (
          <p className="state-message state-message--error">
            {versions.error.message}
          </p>
        )}
        {versions.isSuccess && list.length === 0 && (
          <p className="state-message">{t("history.empty")}</p>
        )}
        <ol className="version-list">
          {list.map((version) => (
            <VersionRow
              key={version.versionId}
              version={version}
              amount={amount(version)}
              selected={version.versionId === selectedId}
              onSelect={() => setSelectedId(version.versionId)}
            />
          ))}
        </ol>
        {selected && !selected.error && preview(selected.versionId)}
        {restore.error && (
          <p className="form-error" role="alert">
            {restore.error.message}
          </p>
        )}
        <div className="dialog__actions">
          <button
            type="button"
            className="button button--secondary"
            onClick={onClose}
          >
            {t("common.close")}
          </button>
          <button
            type="button"
            className="button button--primary"
            disabled={
              !selected || selected.error !== undefined || restore.isPending
            }
            onClick={confirmRestore}
          >
            <RotateCcw size={18} aria-hidden />
            {restore.isPending ? t("history.restoring") : t("history.restore")}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const VersionPreview = ({
  deckId,
  versionId,
}: {
  deckId: string;
  versionId: string;
}) => {
  const { t } = useLanguage();
  const version = useQuery(versionQuery(deckId, versionId));
  if (version.isPending)
    return <p className="state-message">{t("common.loading")}</p>;
  if (version.isError) {
    return (
      <p className="state-message state-message--error">
        {version.error.message}
      </p>
    );
  }
  const deck = version.data.deck;
  return (
    <ol className="version-preview">
      {deck.slides.slice(0, 6).map((slide, index) => (
        <li key={slide.id} className="version-preview__item">
          <ScaledSlide
            slide={slide}
            decorative
            context={{
              pageNumber: index + 1,
              pageCount: deck.slides.length,
              assetBaseUrl: deckAssetBase(deckId),
              template: deckTemplate(deck),
            }}
          />
        </li>
      ))}
    </ol>
  );
};

export const HistoryDialog = ({
  open,
  deckId,
  dirty,
  onClose,
  onRestored,
}: {
  open: boolean;
  deckId: string;
  dirty: boolean;
  onClose: () => void;
  onRestored: (deck: Deck) => void;
}) => {
  const { t } = useLanguage();
  const versions = useQuery({ ...versionsQuery(deckId), enabled: open });
  const restore = useRestoreVersion(deckId, (deck) => {
    onRestored(deck);
    onClose();
  });

  return (
    <HistoryDialogShell
      open={open}
      dirty={dirty}
      versions={versions}
      amount={(version) =>
        version.slideCount === undefined
          ? ""
          : t("unit.slidesSlash", { n: version.slideCount })
      }
      preview={(versionId) => (
        <VersionPreview deckId={deckId} versionId={versionId} />
      )}
      restore={restore}
      onClose={onClose}
    />
  );
};
