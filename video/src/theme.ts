// 色は製品の design/tokens.json から取る(白地と薄い青の机、青の案内)
import tokens from "../../design/tokens.json";

export const color = tokens.color;

export const FPS = 30;
export const WIDTH = 1280;
export const HEIGHT = 720;

export const font = (lang: "en" | "ja") =>
  lang === "ja"
    ? '"Hiragino Sans", "Noto Sans JP", "Avenir Next", system-ui, sans-serif'
    : '"Avenir Next", "Noto Sans JP", "Hiragino Sans", system-ui, sans-serif';

export const mono =
  '"SF Mono", Menlo, "Noto Sans Mono", Consolas, ui-monospace, monospace';
