import assert from "node:assert/strict";
import test from "node:test";

import { isInternalRequestAuthorized } from "../lib/internal-auth";

test("internal authentication accepts headers and rejects query-string secrets", () => {
  const previousToken = process.env.INTERNAL_JOB_TOKEN;
  const token = "test-secret-with-at-least-32-characters";
  process.env.INTERNAL_JOB_TOKEN = token;
  try {
    assert.equal(isInternalRequestAuthorized(new Request(`http://localhost/job?token=${token}`)), false);
    assert.equal(isInternalRequestAuthorized(new Request("http://localhost/job", { headers: { "x-internal-token": token } })), true);
    assert.equal(isInternalRequestAuthorized(new Request("http://localhost/job", { headers: { authorization: "Bearer wrong" } })), false);
  } finally {
    if (previousToken === undefined) delete process.env.INTERNAL_JOB_TOKEN;
    else process.env.INTERNAL_JOB_TOKEN = previousToken;
  }
});
