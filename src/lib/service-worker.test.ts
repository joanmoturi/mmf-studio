import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://mmf.example";
const CURRENT = "mmf-studio-shell-current";
const assetUrls = [
  "/mmf-offline-build.html",
  "/manifest.webmanifest",
  "/_next/static/lazy-spreadsheet.js",
];
const template = readFileSync(new URL("../../scripts/service-worker.js", import.meta.url), "utf8");

interface TestRequest {
  url: string;
  method: string;
  mode: string;
}
interface WorkerEvent {
  request: TestRequest;
  source: { url: string };
  data: { type: string };
  ports: { postMessage: (data: unknown) => void }[];
  waitUntil: (promise: Promise<unknown>) => void;
  respondWith: (promise: Promise<Response>) => void;
}

function harness() {
  const content = new Map<string, Map<string, Response>>();
  const handlers = new Map<string, (event: WorkerEvent) => void>();
  let offline = false,
    failAsset = "";
  const normalize = (value: string | TestRequest) =>
    new URL(typeof value === "string" ? value : value.url, ORIGIN).pathname;
  const storage = {
    keys: async () => [...content.keys()],
    delete: async (name: string) => content.delete(name),
    open: async (name: string) => {
      if (!content.has(name)) content.set(name, new Map());
      const items = content.get(name)!;
      return {
        match: async (value: string | TestRequest) => items.get(normalize(value))?.clone(),
        addAll: async (requests: TestRequest[]) => {
          if (offline || requests.some((request) => normalize(request) === failAsset))
            throw new Error("Download failed");
          for (const request of requests)
            items.set(normalize(request), new Response(`cached ${normalize(request)}`));
        },
      };
    },
  };
  const skipWaiting = vi.fn(async () => {}),
    claim = vi.fn(async () => {});
  class WorkerRequest extends Request {
    constructor(url: string, options?: RequestInit) {
      super(new URL(url, ORIGIN), options);
    }
  }
  runInNewContext(
    template
      .replace('const CACHE_NAME = "__MMF_CACHE_NAME__";', `const CACHE_NAME = "${CURRENT}";`)
      .replace("const PRECACHE_URLS = [];", `const PRECACHE_URLS = ${JSON.stringify(assetUrls)};`),
    {
      self: {
        location: new URL(`${ORIGIN}/sw.js`),
        clients: { claim },
        skipWaiting,
        addEventListener: (type: string, handler: (event: WorkerEvent) => void) =>
          handlers.set(type, handler),
      },
      caches: storage,
      URL,
      Request: WorkerRequest,
      Response,
      fetch: async () => {
        if (offline) throw new Error("Offline");
        return new Response("online shell");
      },
    },
  );
  const dispatch = (type: string, patch: Partial<WorkerEvent> = {}) => {
    let work: Promise<unknown> | null = null,
      response: Promise<Response> | null = null;
    const reply = vi.fn();
    const event: WorkerEvent = {
      request: { url: `${ORIGIN}/`, method: "GET", mode: "navigate" },
      source: { url: `${ORIGIN}/` },
      data: { type: "" },
      ports: [{ postMessage: reply }],
      waitUntil: (promise) => {
        work = promise;
      },
      respondWith: (promise) => {
        response = promise;
      },
      ...patch,
    };
    handlers.get(type)!(event);
    return {
      work: work as Promise<unknown> | null,
      response: response as Promise<Response> | null,
      reply,
    };
  };
  return {
    content,
    storage,
    dispatch,
    skipWaiting,
    claim,
    offline: () => {
      offline = true;
    },
    fail: (url: string) => {
      failAsset = url;
    },
  };
}

describe("production offline shell", () => {
  it("fails an incomplete install without taking over or leaving a partial cache", async () => {
    const worker = harness();
    worker.fail("/_next/static/lazy-spreadsheet.js");
    await expect(worker.dispatch("install").work).rejects.toThrow("Download failed");
    expect(worker.content.has(CURRENT)).toBe(false);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });

  it("does not remove an already working cache when reinstalling the same version fails", async () => {
    const worker = harness();
    await worker.dispatch("install").work;
    worker.fail("/_next/static/lazy-spreadsheet.js");
    await expect(worker.dispatch("install").work).rejects.toThrow("Download failed");
    expect(worker.content.get(CURRENT)!.has(assetUrls[0])).toBe(true);
  });

  it("serves the home screen and deferred code offline without caching plan requests", async () => {
    const worker = harness();
    await worker.dispatch("install").work;
    worker.offline();
    expect(await (await worker.dispatch("fetch").response)!.text()).toBe(`cached ${assetUrls[0]}`);
    const asset = worker.dispatch("fetch", {
      request: {
        url: `${ORIGIN}/_next/static/lazy-spreadsheet.js?version=1`,
        method: "GET",
        mode: "cors",
      },
    });
    expect(await (await asset.response)!.text()).toContain("lazy-spreadsheet");
    expect(
      worker.dispatch("fetch", {
        request: { url: `${ORIGIN}/api/plan`, method: "POST", mode: "cors" },
      }).response,
    ).toBeNull();
    expect(
      worker.dispatch("fetch", {
        request: { url: "https://other.example/plan", method: "GET", mode: "cors" },
      }).response,
    ).toBeNull();
  });

  it("keeps the cached shell immutable when an online navigation returns newer HTML", async () => {
    const worker = harness();
    await worker.dispatch("install").work;
    expect(await (await worker.dispatch("fetch").response)!.text()).toBe("online shell");
    worker.offline();
    expect(await (await worker.dispatch("fetch").response)!.text()).toBe(`cached ${assetUrls[0]}`);
  });

  it("retains the prior app cache and never deletes unrelated origin caches", async () => {
    const worker = harness();
    await worker.storage.open("some-other-app");
    await worker.storage.open("mmf-studio-shell-oldest");
    const previous = await worker.storage.open("mmf-studio-shell-previous");
    await previous.addAll([
      { url: `${ORIGIN}/_next/static/old-deferred.js`, method: "GET", mode: "cors" },
    ]);
    await worker.dispatch("install").work;
    await worker.dispatch("activate").work;
    expect(await worker.storage.keys()).toEqual([
      "some-other-app",
      "mmf-studio-shell-previous",
      CURRENT,
    ]);
    expect(worker.claim).toHaveBeenCalledOnce();
    worker.offline();
    const response = worker.dispatch("fetch", {
      request: { url: `${ORIGIN}/_next/static/old-deferred.js`, method: "GET", mode: "cors" },
    }).response;
    expect(await (await response)!.text()).toContain("old-deferred.js");
  });

  it("reports readiness from actual cache contents and activates only on a same-origin request", async () => {
    const worker = harness();
    await worker.dispatch("install").work;
    const ready = worker.dispatch("message", { data: { type: "OFFLINE_STATUS" } });
    await ready.work;
    expect(ready.reply).toHaveBeenCalledWith({ ready: true, version: CURRENT });
    worker.content.get(CURRENT)!.delete("/_next/static/lazy-spreadsheet.js");
    const incomplete = worker.dispatch("message", { data: { type: "OFFLINE_STATUS" } });
    await incomplete.work;
    expect(incomplete.reply).toHaveBeenCalledWith({ ready: false, version: CURRENT });
    worker.dispatch("message", {
      source: { url: "https://other.example/" },
      data: { type: "ACTIVATE_UPDATE" },
    });
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    await worker.dispatch("message", { data: { type: "ACTIVATE_UPDATE" } }).work;
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });
});
