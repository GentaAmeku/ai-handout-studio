import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Pencil } from "lucide-react";
import { deckAssetBase } from "../../api/client";
import { designTemplatesQuery } from "../../api/queries";
import { Dialog } from "../../components/Dialog";
import { ScaledSlide } from "../../components/ScaledSlide";
import { useLanguage } from "../../i18n/language";
import type { Slide } from "../../schema/deck";

// 資料のテンプレートを選び替える。選んだ見た目は、いまのスライドを描いた小さな見本で見比べる。
// 中身(slides・blocks)は触らず、呼び出し側が deck.template だけを書き換える
export const TemplateSwitchDialog = ({
  open,
  deckId,
  current,
  slide,
  onClose,
  onSelect,
}: {
  open: boolean;
  deckId: string;
  // 資料がいま使っているテンプレートの名前(既定へ解決済み)
  current: string;
  slide: Slide | undefined;
  onClose: () => void;
  onSelect: (name: string) => void;
}) => {
  const { t } = useLanguage();
  const designs = useQuery(designTemplatesQuery);
  const list = designs.data?.templates.slide ?? [];

  return (
    <Dialog open={open} onClose={onClose} title={t("templateSwitch.title")}>
      <div className="dialog__form">
        <p className="dialog__lead">{t("templateSwitch.hint")}</p>
        {designs.isError && (
          <p className="form-error">{designs.error.message}</p>
        )}
        <div className="template-options" role="radiogroup">
          {list.map((design) => (
            <label key={design.name} className="template-option">
              <input
                type="radio"
                name="template"
                value={design.name}
                checked={design.name === current}
                onChange={() => onSelect(design.name)}
                className="visually-hidden"
              />
              <span className="template-option__thumb">
                {slide && (
                  <ScaledSlide
                    slide={slide}
                    decorative
                    context={{
                      pageNumber: 1,
                      pageCount: 1,
                      assetBaseUrl: deckAssetBase(deckId),
                      template: design.name,
                    }}
                  />
                )}
              </span>
              <span className="template-option__title">{design.label}</span>
              {design.name === current && (
                <span className="template-option__meta">
                  {t("templateSwitch.current")}
                </span>
              )}
            </label>
          ))}
        </div>
        <div className="dialog__actions">
          <Link
            to="/slides/templates/$name"
            params={{ name: current }}
            search={{ from: deckId }}
            className="button button--secondary"
          >
            <Pencil size={16} aria-hidden />
            {t("templateSwitch.edit")}
          </Link>
          <button
            type="button"
            className="button button--primary"
            onClick={onClose}
          >
            {t("templateSwitch.done")}
          </button>
        </div>
      </div>
    </Dialog>
  );
};
