import { NETWORKS } from "spare-sdk";
import { createFsStore } from "./adapters/fs-store.js";
import { createHorizonAdapter } from "./adapters/horizon.js";
import { createJsonRpcTransport, createRpcAdapter } from "./adapters/rpc.js";
import { createSafeFetch, createTomlVerifier } from "./adapters/toml.js";
import type { Compose } from "./cli.js";

/**
 * Composition root: the only place real adapters are wired. `rpc` exists only when an RPC URL is
 * given, so `rebuild` cannot touch RPC even by accident (D9).
 */
export const composeReal: Compose = (config, opts) => ({
  rpc:
    opts.rpcUrl === undefined
      ? undefined
      : createRpcAdapter({ transport: createJsonRpcTransport({ url: opts.rpcUrl, fetch: globalThis.fetch }), network: config.network }),
  horizon: createHorizonAdapter({ baseUrl: NETWORKS[config.network].horizonUrl, fetch: globalThis.fetch }),
  verifier: createTomlVerifier({ fetch: createSafeFetch() }),
  clock: { now: () => new Date() },
  store: createFsStore(opts.out),
});
