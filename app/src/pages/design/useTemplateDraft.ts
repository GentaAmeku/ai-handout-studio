import { useBlocker } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { useSaveDesignTemplate } from "../../api/queries";
import type { ResolvedTemplate } from "../../design/theme";
import { useLanguage } from "../../i18n/language";
import {
  type Surface,
  type Template,
  templateSchemas,
} from "../../schema/design";
import {
  type DesignBase,
  draftVariables,
  resolveDraft,
  sameTemplate,
} from "./draft";

// 編集中のテンプレート1つ。テンプレートの編集が使う。骨格(layout)も同じ下書きに入る

export type TemplateDraft = {
  surface: Surface;
  name: string;
  template: Template;
  setTemplate: (template: Template) => void;
  resolved: ResolvedTemplate | undefined;
  variables: Record<string, string>;
  dirty: boolean;
  error: string | undefined;
  saving: boolean;
  saveError: string | undefined;
  canSave: boolean;
  // 保存と build が終わったら、送った版を解いたもので onSaved を呼ぶ
  save: (onSaved: (resolved: ResolvedTemplate) => void) => void;
};

export const useTemplateDraft = ({
  surface,
  name,
  initial,
  base,
}: {
  surface: Surface;
  name: string;
  initial: Template;
  base: DesignBase;
}): TemplateDraft => {
  const { t } = useLanguage();
  const [template, setTemplate] = useState<Template>(initial);
  const [saved, setSaved] = useState<Template>(initial);
  const mutation = useSaveDesignTemplate();

  const resolved = useMemo(
    () => resolveDraft(surface, name, template, base),
    [surface, name, template, base],
  );
  const variables = useMemo(
    () => (resolved ? draftVariables(resolved) : {}),
    [resolved],
  );
  const dirty = !sameTemplate(saved, template);
  const parsed = templateSchemas[surface].safeParse(template);

  useBlocker({
    shouldBlockFn: ({ current, next }) =>
      current.pathname !== next.pathname &&
      !window.confirm(t("design.leaveConfirm")),
    enableBeforeUnload: dirty,
    disabled: !dirty,
  });

  const save = (onSaved: (resolved: ResolvedTemplate) => void) => {
    if (!parsed.success || !resolved) return;
    // 保存中に編集が進んでも、送った版を「保存済み」として覚える
    const submitted = template;
    const submittedResolved = resolved;
    mutation.mutate(
      { surface, name, template: parsed.data },
      {
        onSuccess: () => {
          setSaved(submitted);
          onSaved(submittedResolved);
        },
      },
    );
  };

  return {
    surface,
    name,
    template,
    setTemplate,
    resolved,
    variables,
    dirty,
    error: parsed.success ? undefined : z.prettifyError(parsed.error),
    saving: mutation.isPending,
    saveError: mutation.isError ? mutation.error.message : undefined,
    canSave: !mutation.isPending && parsed.success && !!resolved && dirty,
    save,
  };
};
