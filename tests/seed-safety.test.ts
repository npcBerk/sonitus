import assert from "node:assert/strict";
import test from "node:test";

import { assertDestructiveSeedAllowed } from "../lib/seed-safety";

test("destructive seed accepts loopback PostgreSQL targets", () => {
  assert.doesNotThrow(() =>
    assertDestructiveSeedAllowed(
      "postgresql://sonitus:password@localhost:5432/sonitus?schema=public"
    )
  );
  assert.doesNotThrow(() =>
    assertDestructiveSeedAllowed("postgres://sonitus:password@127.0.0.1:5432/sonitus")
  );
});

test("destructive seed rejects remote databases by default", () => {
  assert.throws(
    () =>
      assertDestructiveSeedAllowed(
        "postgresql://user:password@remote-db.example.com/database?sslmode=require"
      ),
    /Refusing to clear non-local database host "remote-db\.example\.com"/
  );
});

test("destructive seed requires an explicit override for a non-loopback Docker host", () => {
  assert.throws(
    () => assertDestructiveSeedAllowed("postgresql://sonitus:password@postgres:5432/sonitus"),
    /ALLOW_DESTRUCTIVE_SEED=true/
  );
  assert.doesNotThrow(() =>
    assertDestructiveSeedAllowed(
      "postgresql://sonitus:password@postgres:5432/sonitus",
      "true"
    )
  );
});

test("destructive seed rejects missing, malformed, and non-PostgreSQL URLs", () => {
  assert.throws(() => assertDestructiveSeedAllowed(undefined), /DATABASE_URL is required/);
  assert.throws(() => assertDestructiveSeedAllowed("not-a-url"), /valid PostgreSQL URL/);
  assert.throws(
    () => assertDestructiveSeedAllowed("https://localhost/database"),
    /postgres or postgresql protocol/
  );
});
