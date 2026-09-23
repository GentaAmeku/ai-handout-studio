import "./editor.css";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link } from "@tanstack/react-router";
import { ArrowLeft, TriangleAlert } from "lucide-react";
import { deckQuery } from "../../api/queries";
import { useLanguage } from "../../i18n/language";
import { Editor } from "./Editor";

const route = getRouteApi("/decks/$deckId");

const SimpleBar = ({ title }: { title: string }) => {
  const { t } = useLanguage();
  return (
    <header className="viewer__bar">
      <Link to="/slides" className="button button--ghost">
        <ArrowLeft size={18} aria-hidden />
        {t("common.backToList")}
      </Link>
      <span className="viewer__divider" aria-hidden />
      <h1 className="viewer__title">{title}</h1>
    </header>
  );
};

const Message = ({ title, message }: { title: string; message: string }) => (
  <div className="viewer">
    <SimpleBar title={title} />
    <div className="state-message state-message--error viewer__message">
      <TriangleAlert size={24} aria-hidden />
      <pre className="state-message__detail">{message}</pre>
    </div>
  </div>
);

export const EditorPage = () => {
  const { t } = useLanguage();
  const { deckId } = route.useParams();
  const detail = useQuery(deckQuery(deckId));

  if (detail.isPending) {
    return <p className="state-message">{t("common.loading")}</p>;
  }
  if (detail.isError) {
    return (
      <Message title={t("editor.openFail")} message={detail.error.message} />
    );
  }
  if (detail.data.state === "invalid") {
    return (
      <Message
        title={t("editor.loadFail", { deckId })}
        message={detail.data.message}
      />
    );
  }
  return <Editor key={deckId} deckId={deckId} serverDeck={detail.data.deck} />;
};
