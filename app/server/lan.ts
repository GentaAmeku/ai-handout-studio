import type { NetworkInterfaceInfo } from "node:os";

// LAN からの閲覧。`open --lan` / `restart --lan` で起こしたときだけ、
// 同じ Wi-Fi のスマホから原寸ページ(readUrl)を開けるようにする。既定はループバックだけ

// vite.config.ts がこれを見て全ての口で待ち受ける
export const LAN_ENV = "AI_HANDOUT_STUDIO_LAN";

// 同じネットワークの誰でも workspace/ の資料を読めるので、出力に必ず添える
export const LAN_NOTE =
  "共有の Wi-Fi では使わない(同じネットワークの誰でも資料を読める)";

// Mac の LAN の IPv4。ループバック(internal)・IPv6・link-local(169.254.)は除く
export const lanAddressesOf = (
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): string[] =>
  Object.values(interfaces)
    .flatMap((infos) => infos ?? [])
    .filter(
      (info) =>
        info.family === "IPv4" &&
        !info.internal &&
        !info.address.startsWith("169.254."),
    )
    .map((info) => info.address);

export const lanOriginsOf = (addresses: string[], port: number): string[] =>
  addresses.map((address) => `http://${address}:${port}`);

export type ListenScope = "lan" | "loopback" | "none";

// `lsof -nP -iTCP:<port> -sTCP:LISTEN` の出力から待ち受けの範囲を読む。
// `*:5190` か LAN の IP なら lan、`127.0.0.1:5190`・`[::1]:5190` だけなら loopback
export const listenScopeOf = (
  lsofOutput: string,
  port: number,
): ListenScope => {
  const hosts = lsofOutput
    .split("\n")
    .map((line) => new RegExp(`TCP (\\S+):${port} \\(LISTEN\\)`).exec(line))
    .flatMap((match) => (match?.[1] ? [match[1]] : []));
  if (hosts.length === 0) return "none";
  return hosts.some((host) => host !== "127.0.0.1" && host !== "[::1]")
    ? "lan"
    : "loopback";
};
