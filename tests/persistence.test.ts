import assert from "node:assert/strict";
import test from "node:test";

import { computeVolumeDeltaPercent } from "../lib/persistence";

test("24h volume delta uses the supplied historical baseline", () => {
  assert.equal(computeVolumeDeltaPercent(125, 100), 25);
  assert.equal(computeVolumeDeltaPercent(75, 100), -25);
  assert.equal(computeVolumeDeltaPercent(100, null), 0);
});
