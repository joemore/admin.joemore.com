import assert from "node:assert/strict";
import test from "node:test";
import { revokeCurrentSession } from "../src/lib/auth/sign-out";

test("sign out verifies the current caller and revokes globally", async () => {
  const calls: string[] = [];
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => {
        calls.push("verify");
        return { error: null };
      },
      signOut: async ({ scope }) => {
        calls.push(scope);
        return { error: null };
      },
    },
  });
  assert.deepEqual(result, {});
  assert.deepEqual(calls, ["verify", "global"]);
});

test("revoked/non-admin users can sign out without a membership check", async () => {
  let signedOut = false;
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => ({ error: null }),
      signOut: async () => {
        signedOut = true;
        return { error: null };
      },
    },
  });
  assert.deepEqual(result, {});
  assert.ok(signedOut);
});

test("expired sessions still clear stale session cookies", async () => {
  let cleared = false;
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => ({ error: { name: "AuthSessionMissingError" } }),
      signOut: async () => {
        cleared = true;
        return { error: null };
      },
    },
  });
  assert.deepEqual(result, {});
  assert.ok(cleared);
});

test("verification outages do not report successful sign out", async () => {
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => ({ error: { status: 503 } }),
      signOut: async () => {
        assert.fail("must verify before revocation");
      },
    },
  });
  assert.ok(result.error);
});

test("revocation failures do not report successful sign out", async () => {
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => ({ error: null }),
      signOut: async () => ({ error: { status: 503 } }),
    },
  });
  assert.ok(result.error);
});

test("network exceptions produce a retryable sign out error", async () => {
  const result = await revokeCurrentSession({
    auth: {
      getUser: async () => {
        throw new TypeError("Network error");
      },
      signOut: async () => ({ error: null }),
    },
  });
  assert.ok(result.error);
});
