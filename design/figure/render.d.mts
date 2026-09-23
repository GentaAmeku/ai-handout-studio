// 図の生成器(render.mjs)の型。build と見本の生成が TypeScript から呼ぶぶんだけ

export type FigureNode = {
  label: string;
  kind?: "step" | "branch" | "outside" | "store";
};

export type FigureInput = {
  figure: 1;
  caption: string;
  flow: (FigureNode & { fork?: FigureNode[] })[];
};

export type Diagnostic = {
  rule: string;
  at: string;
  subject?: string;
  message: string;
  fix: string;
};

export const validate: (input: unknown) => Diagnostic[];
export const formatDiagnostics: (list: Diagnostic[]) => string;
// lang は読み上げの説明(aria-label)の言語。既定は ja
export const render: (
  input: FigureInput,
  lang?: "ja" | "en",
) => {
  svg: string;
  aria: string;
  width: number;
  height: number;
  nodes: number;
};
export const snippet: (input: FigureInput, lang?: "ja" | "en") => string;
export const page: (
  input: FigureInput,
  options?: { tokens?: string },
) => string;
export const pageHtml: (input: FigureInput, css: string) => string;
