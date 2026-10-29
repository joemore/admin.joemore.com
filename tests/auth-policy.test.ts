import assert from "node:assert/strict";
import test from "node:test";
import {
  accessRedirect,
  resolveAccess,
  type AccessDependencies,
} from "../src/lib/auth/policy";
import type {
  AdminMembership,
  AdminRole,
} from "../src/lib/supabase/database.types";

const user = { id: "fixture-user", email: "fixture@example.invalid" };
const membership: AdminMembership = {
  user_id: user.id,
  role: "super_admin",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
  created_by: null,
};

function dependencies(
  row: AdminMembership | null = membership,
): AccessDependencies {
  return {
    getVerifiedUser: async () => ({ data: user, error: null }),
    getMembership: async (id) => {
      assert.equal(id, user.id, "membership must use the verified identity");
      return { data: row, error: null };
    },
  };
}

test("a signed-out request cannot query membership and redirects to login", async () => {
  const state = await resolveAccess({
    getVerifiedUser: async () => ({
      data: null,
      error: { name: "AuthSessionMissingError" },
    }),
    getMembership: async () => {
      throw new Error("membership must not be queried");
    },
  });
  assert.deepEqual(state, { status: "signed-out" });
  assert.equal(accessRedirect(state), "/login");
});

test("a missing user without an auth error is signed out", async () => {
  const deps = dependencies();
  deps.getVerifiedUser = async () => ({ data: null, error: null });
  assert.deepEqual(await resolveAccess(deps), { status: "signed-out" });
});

test("expired sessions return to login", async () => {
  const deps = dependencies();
  deps.getVerifiedUser = async () => ({
    data: null,
    error: { code: "refresh_token_not_found" },
  });
  assert.deepEqual(await resolveAccess(deps), { status: "signed-out" });
});

for (const role of ["super_admin", "admin", "editor"] as const) {
  test(`active ${role} membership permits access`, async () => {
    const state = await resolveAccess(dependencies({ ...membership, role }));
    assert.equal(state.status, "admin");
    if (state.status === "admin") {
      assert.equal(state.admin.role, role);
      assert.equal(state.admin.userId, user.id);
    }
    assert.equal(accessRedirect(state), null);
  });
}

test("a non-member is denied", async () => {
  const state = await resolveAccess(dependencies(null));
  assert.deepEqual(state, { status: "denied" });
  assert.equal(accessRedirect(state), "/access-denied");
});

test("inactive membership is denied on the next check", async () => {
  const row = { ...membership };
  const deps = dependencies(row);
  assert.equal((await resolveAccess(deps)).status, "admin");
  row.is_active = false;
  assert.deepEqual(await resolveAccess(deps), { status: "denied" });
});

test("a different UUID cannot confer access", async () => {
  assert.deepEqual(
    await resolveAccess(
      dependencies({ ...membership, user_id: "another-user" }),
    ),
    { status: "denied" },
  );
});

test("an unexpected role cannot confer access", async () => {
  assert.deepEqual(
    await resolveAccess(
      dependencies({ ...membership, role: "owner" as AdminRole }),
    ),
    { status: "denied" },
  );
});

test("anonymous Supabase Auth users are denied", async () => {
  const deps = dependencies();
  deps.getVerifiedUser = async () => ({
    data: { ...user, is_anonymous: true },
    error: null,
  });
  assert.deepEqual(await resolveAccess(deps), { status: "denied" });
});

test("editing user metadata cannot grant membership", async () => {
  const deps = dependencies(null);
  const metadataUser = {
    ...user,
    user_metadata: {
      role: "super_admin",
      is_active: true,
      user_id: "another-user",
    },
  };
  deps.getVerifiedUser = async () => ({ data: metadataUser, error: null });
  assert.deepEqual(await resolveAccess(deps), { status: "denied" });
});

test("auth connection errors fail closed", async () => {
  const deps = dependencies();
  deps.getVerifiedUser = async () => ({ data: null, error: { status: 503 } });
  const state = await resolveAccess(deps);
  assert.deepEqual(state, { status: "unavailable" });
  assert.equal(accessRedirect(state), "/connection-error");
});

test("a membership query error never masquerades as a successful check", async () => {
  const deps = dependencies();
  deps.getMembership = async () => ({
    data: membership,
    error: { code: "42501" },
  });
  assert.deepEqual(await resolveAccess(deps), { status: "unavailable" });
});

test("unexpected transport exceptions fail closed", async () => {
  const deps = dependencies();
  deps.getMembership = async () => {
    throw new TypeError("Network error");
  };
  assert.deepEqual(await resolveAccess(deps), { status: "unavailable" });
});

test("configuration state routes to setup/login", () => {
  assert.equal(accessRedirect({ status: "configuration" }), "/login");
});
