import { execFileSync } from "node:child_process";
import { basename } from "node:path";
import type { AskedFrom } from "../src/schema/handout.ts";

// 質問票の質問元。sheet new を走らせたフォルダ(git の中ならリポジトリの名前)とブランチを取り、
// AI が --from で渡した会話の名前を添える。会話を並べて使っても、どの会話の質問票か分かるようにする

const git = (cwd: string, args: readonly string[]): string | undefined => {
  try {
    const out = execFileSync("git", [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return out || undefined;
  } catch {
    return undefined;
  }
};

const clip = (value: string): string => value.slice(0, 100);

export const askedFromOf = (cwd: string, conversation?: string): AskedFrom => {
  const top = git(cwd, ["rev-parse", "--show-toplevel"]);
  const branch = top ? git(cwd, ["branch", "--show-current"]) : undefined;
  return {
    folder: clip(basename(top ?? cwd) || cwd),
    ...(branch ? { branch: clip(branch) } : {}),
    ...(conversation ? { conversation: clip(conversation) } : {}),
  };
};

// 題名の右に出す1行。会話の名前を先に、フォルダとブランチを後に置く
export const askedFromText = (from: AskedFrom): string =>
  [
    from.conversation,
    from.branch ? `${from.folder} (${from.branch})` : from.folder,
  ]
    .filter(Boolean)
    .join(" · ");

// タブ名の頭に付ける短い名前。幅が狭いので、会話の名前があればそれだけにする
export const askedFromShort = (from: AskedFrom): string =>
  from.conversation ?? from.folder;
