import assert from "node:assert/strict";
import test from "node:test";
import { parseSupabaseConfig } from "../src/lib/supabase/config";

// Inert format fixtures, never sent to a server or used as credentials.
const publishableFixture = "sb_publishable_FORMAT_TEST_ONLY";
const url = "https://supabase.example.invalid";

test("missing configuration produces a meaningful setup state", () => {
  assert.deepEqual(parseSupabaseConfig(undefined, undefined), {
    configured: false,
    reason: "missing",
  });
  assert.deepEqual(parseSupabaseConfig(url, ""), {
    configured: false,
    reason: "missing",
  });
});

test("a publishable-format key and HTTPS endpoint are accepted", () => {
  assert.deepEqual(parseSupabaseConfig(`${url}/`, publishableFixture), {
    configured: true,
    url,
    publishableKey: publishableFixture,
  });
});

test("privileged and legacy keys are refused", () => {
  for (const key of [
    "sb_secret_FORMAT_TEST_ONLY",
    "eyJ_FORMAT_TEST_ONLY",
    "anon",
    "sb_publishable_",
  ]) {
    assert.deepEqual(parseSupabaseConfig(url, key), {
      configured: false,
      reason: "invalid-key",
    });
  }
});

test("remote HTTP and malformed endpoints are refused", () => {
  for (const endpoint of [
    "not a url",
    "http://supabase.example.invalid",
    `${url}/rest/v1`,
    `${url}?key=unsafe`,
    "https://user:password@supabase.example.invalid",
  ]) {
    assert.deepEqual(parseSupabaseConfig(endpoint, publishableFixture), {
      configured: false,
      reason: "invalid-url",
    });
  }
});

test("loopback HTTP is allowed for local-only development", () => {
  assert.equal(
    parseSupabaseConfig("http://127.0.0.1:54321", publishableFixture)
      .configured,
    true,
  );
});
