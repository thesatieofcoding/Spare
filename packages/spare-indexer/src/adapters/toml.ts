import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import { verifyFoundation, type FetchLike } from "spare-sdk";
import { Agent, fetch as undiciFetch } from "undici";
import type { DomainVerifier } from "../ports.js";

const CONCURRENCY = 4;

function parseIPv4(s: string): number[] | null {
  if (!isIPv4(s)) return null;
  return s.split(".").map(Number);
}

/** Expands any valid IPv6 text (incl. `::` and a dotted-quad tail) to eight 16-bit groups. */
function parseIPv6(raw: string): number[] | null {
  const s = raw.split("%", 1)[0] ?? "";
  if (!isIPv6(s)) return null;
  let head = s;
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s)?.[1];
  if (tail !== undefined) {
    const o = tail.split(".").map(Number) as [number, number, number, number];
    head = s.slice(0, -tail.length) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [left = "", right] = head.split("::");
  const l = left === "" ? [] : left.split(":");
  const r = right === undefined || right === "" ? [] : right.split(":");
  const fill = right === undefined ? [] : new Array<string>(8 - l.length - r.length).fill("0");
  const groups = [...l, ...fill, ...r].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => Number.isInteger(g)) ? groups : null;
}

function blockedV4([a, b, c]: number[]): boolean {
  return (
    a === 0 || // unspecified / "this network"
    a === 10 || // private
    a === 127 || // loopback
    (a === 100 && b! >= 64 && b! <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b! >= 16 && b! <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a! >= 224 // multicast + reserved + broadcast
  );
}

/**
 * True when connecting to `ip` could reach something internal. Fails closed: anything that does
 * not parse as an IP literal is blocked.
 */
export function isBlockedAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4 !== null) return blockedV4(v4);
  const g = parseIPv6(ip);
  if (g === null) return true;
  const embedded = [g[6]! >> 8, g[6]! & 0xff, g[7]! >> 8, g[7]! & 0xff];
  const high = g.slice(0, 5).every((x) => x === 0);
  if (g.slice(0, 7).every((x) => x === 0) && g[7]! <= 1) return true; // :: and ::1
  if (high && g[5] === 0xffff) return blockedV4(embedded); // ::ffff:a.b.c.d (IPv4-mapped)
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return blockedV4(embedded); // NAT64
  if ((g[0]! & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g[0]! & 0xfe00) === 0xfc00) return true; // ULA fc00::/7
  if ((g[0]! & 0xff00) === 0xff00) return true; // multicast
  return false;
}

export type Resolver = (hostname: string, options: { all: true; family?: number; hints?: number }, cb: (err: NodeJS.ErrnoException | null, addrs: LookupAddress[]) => void) => void;

/**
 * DNS lookup for undici's `connect.lookup`. The check happens on the exact addresses the socket
 * will use, so DNS rebinding between "check" and "connect" is impossible (D14).
 */
export function createSafeLookup(resolve: Resolver = dnsLookup as unknown as Resolver): LookupFunction {
  return ((hostname: string, options: { all?: boolean; family?: number; hints?: number }, callback: (err: Error | null, address?: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname, { ...options, all: true }, (err, addrs) => {
      if (err) return callback(err);
      if (addrs.length === 0) return callback(new Error(`blocked: ${hostname} did not resolve`));
      if (addrs.some((a) => isBlockedAddress(a.address))) return callback(new Error(`blocked: ${hostname} resolves to a non-public address`));
      if (options.all === true) return callback(null, addrs);
      callback(null, addrs[0]!.address, addrs[0]!.family);
    });
  }) as unknown as LookupFunction;
}

/** FetchLike whose sockets can only reach public addresses. */
export function createSafeFetch(resolve?: Resolver): FetchLike {
  const dispatcher = new Agent({ connect: { lookup: createSafeLookup(resolve) } });
  return ((input: unknown, init?: object) => undiciFetch(input as never, { ...init, dispatcher } as never)) as unknown as FetchLike;
}

/**
 * DomainVerifier over spare-sdk `verifyFoundation` (https, no redirect, 5s, 100KB, hostname
 * regex). Boolean only; every failure is `false`. At most 4 checks in flight.
 */
export function createTomlVerifier(opts: { fetch: FetchLike; concurrency?: number }): DomainVerifier {
  const max = opts.concurrency ?? CONCURRENCY;
  let active = 0;
  const waiting: (() => void)[] = [];
  const acquire = async (): Promise<void> => {
    if (active < max) {
      active++;
      return;
    }
    await new Promise<void>((r) => waiting.push(r)); // slot is handed over without decrementing
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else active--;
  };
  return {
    async verify(f) {
      await acquire();
      try {
        return await verifyFoundation({ account: f.account, domain: f.domain }, opts.fetch);
      } catch {
        return false;
      } finally {
        release();
      }
    },
  };
}
