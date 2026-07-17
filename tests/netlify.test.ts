import assert from "node:assert/strict";
import test from "node:test";

import { config as backgroundConfig } from "../netlify/functions/market-snapshot-background";
import scheduleMarketSnapshot, { config as scheduleConfig } from "../netlify/functions/market-snapshot-schedule";

test("Netlify ingestion uses a ten-minute scheduler and a background worker", () => {
  assert.equal(scheduleConfig.schedule, "*/10 * * * *");
  assert.equal(backgroundConfig.background, true);
  assert.equal(backgroundConfig.path, "/internal/netlify/market-snapshot-background");
});

test("Netlify scheduler authenticates its background invocation", async () => {
  const previousToken = process.env.INTERNAL_JOB_TOKEN;
  const previousFetch = globalThis.fetch;
  const token = "netlify-test-token-with-32-characters";
  process.env.INTERNAL_JOB_TOKEN = token;
  let invoked = false;
  globalThis.fetch = async (input, init) => {
    invoked = true;
    assert.equal(String(input), "https://sonitus.netlify.app/internal/netlify/market-snapshot-background");
    assert.equal(new Headers(init?.headers).get("authorization"), `Bearer ${token}`);
    return new Response(null, { status: 202 });
  };

  try {
    await scheduleMarketSnapshot(
      new Request("https://sonitus.netlify.app/.netlify/functions/market-snapshot-schedule", {
        method: "POST",
        body: JSON.stringify({ next_run: new Date().toISOString() })
      }),
      { site: { url: "https://sonitus.netlify.app" } } as Parameters<typeof scheduleMarketSnapshot>[1]
    );
    assert.equal(invoked, true);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.INTERNAL_JOB_TOKEN;
    else process.env.INTERNAL_JOB_TOKEN = previousToken;
  }
});
