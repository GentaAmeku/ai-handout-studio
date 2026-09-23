import { useState } from "react";
import { applySlideJson } from "../../editor/slide-json";
import type { EditorAction } from "../../editor/state";
import { useLanguage } from "../../i18n/language";
import type { Deck, Slide } from "../../schema/deck";

// 選んでいるスライドの JSON を直す。「適用」で検証し、通ったものだけを下書きへ入れる
export const JsonPanel = ({
  deck,
  slide,
  onEdit,
}: {
  deck: Deck;
  slide: Slide;
  onEdit: (action: EditorAction) => void;
}) => {
  const initial = JSON.stringify(slide, null, 2);
  const [text, setText] = useState(initial);
  const [error, setError] = useState<string>();
  const { t } = useLanguage();
  const changed = text !== initial;

  const apply = () => {
    const result = applySlideJson(deck, slide.id, text);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setError(undefined);
    onEdit({
      type: "edit",
      deck: result.deck,
      selection: { slideId: slide.id },
    });
  };

  return (
    <div className="json-panel">
      <p className="prop-panel__hint">{t("json.lead")}</p>
      <textarea
        className="json-panel__text"
        aria-label={t("json.aria")}
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.currentTarget.value)}
      />
      {error && (
        <pre className="form-error json-panel__error" role="alert">
          {error}
        </pre>
      )}
      <div className="json-panel__actions">
        <button
          type="button"
          className="button button--secondary"
          disabled={!changed}
          onClick={() => {
            setText(initial);
            setError(undefined);
          }}
        >
          {t("json.reset")}
        </button>
        <button
          type="button"
          className="button button--primary"
          disabled={!changed}
          onClick={apply}
        >
          {t("json.apply")}
        </button>
      </div>
    </div>
  );
};
