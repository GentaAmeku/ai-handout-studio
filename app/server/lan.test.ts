import type { NetworkInterfaceInfo } from "node:os";
import { describe, expect, it } from "vitest";
import { lanAddressesOf, lanOriginsOf, listenScopeOf } from "./lan";

const info = (
  address: string,
  family: "IPv4" | "IPv6",
  internal = false,
): NetworkInterfaceInfo =>
  family === "IPv4"
    ? {
        address,
        family,
        internal,
        netmask: "255.255.255.0",
        mac: "00:00:00:00:00:00",
        cidr: null,
      }
    : {
        address,
        family,
        internal,
        netmask: "ffff:ffff:ffff:ffff::",
        mac: "00:00:00:00:00:00",
        cidr: null,
        scopeid: 0,
      };

describe("LAN の IPv4", () => {
  it("ループバック・IPv6・link-local を除き、残りを全部返す", () => {
    expect(
      lanAddressesOf({
        lo0: [info("127.0.0.1", "IPv4", true), info("::1", "IPv6", true)],
        en0: [info("fe80::1", "IPv6"), info("192.168.1.20", "IPv4")],
        en5: [info("169.254.10.2", "IPv4")],
        utun3: [info("10.0.0.5", "IPv4")],
        bridge0: undefined,
      }),
    ).toEqual(["192.168.1.20", "10.0.0.5"]);
  });

  it("アドレスから origin を組む", () => {
    expect(lanOriginsOf(["192.168.1.20"], 5190)).toEqual([
      "http://192.168.1.20:5190",
    ]);
  });
});

describe("待ち受けの範囲", () => {
  const header =
    "COMMAND   PID   USER   FD   TYPE             DEVICE SIZE/OFF NODE NAME";

  it("*:5190 なら lan、127.0.0.1 と ::1 だけなら loopback、無ければ none", () => {
    expect(
      listenScopeOf(
        `${header}\nnode    123 me   20u  IPv6 0x1      0t0  TCP *:5190 (LISTEN)\n`,
        5190,
      ),
    ).toBe("lan");
    expect(
      listenScopeOf(
        `${header}\nnode    123 me   20u  IPv4 0x1      0t0  TCP 127.0.0.1:5190 (LISTEN)\nnode    123 me   21u  IPv6 0x2      0t0  TCP [::1]:5190 (LISTEN)\n`,
        5190,
      ),
    ).toBe("loopback");
    expect(listenScopeOf("", 5190)).toBe("none");
    expect(
      listenScopeOf(
        `${header}\nnode    123 me   20u  IPv4 0x1      0t0  TCP 127.0.0.1:51900 (LISTEN)\n`,
        5190,
      ),
    ).toBe("none");
  });
});
