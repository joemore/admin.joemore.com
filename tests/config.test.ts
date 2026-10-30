import assert from "node:assert/strict";
import test from "node:test";
import {
  getSupabaseConfig,
  parseSupabaseConfig,
} from "../src/lib/supabase/config";

// Inert format fixtures. Never sent to a server or used as credentials.
const publishableFixture = "sb_publishable_FORMAT_TEST_ONLY";
const url = "https://supabase.example.invalid";

test("missing configuration produces a meaningful setup state", () => {
  for (const [endpoint, key] of [
    [undefined, undefined],
    [url, ""],
    [url, "   "],
  ]) {
    assert.deepEqual(parseSupabaseConfig(endpoint, key), {
      configured: false,
      reason: "missing",
    });
  }
});

test("a publishable key and HTTPS endpoint are accepted and trimmed", () => {
  assert.deepEqual(parseSupabaseConfig(` ${url}/ `, ` ${publishableFixture} `), {
    configured: true,
    url,
    publishableKey: publishableFixture,
  });
});

test("privileged, legacy and malformed keys are refused", () => {
  for (const key of [
    "sb_secret_FORMAT_TEST_ONLY",
    "eyJ_FORMAT_TEST_ONLY",
    "anon",
    "sb_publishable_",
    "sb_publishable_invalid.key",
    "sb_publishable_bad key",
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
    parseSupabaseConfig("http://127.0.0.1:54321", publishableFixture).configured,
    true,
  );
});

test("configuration reads only the publishable key variable", () => {
  const names = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ] as const;
  const previous = names.map((name) => process.env[name]);
  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "LEGACY_TEST_ONLY";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = publishableFixture;
    assert.deepEqual(getSupabaseConfig(), {
      configured: true,
      url,
      publishableKey: publishableFixture,
    });
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.deepEqual(getSupabaseConfig(), {
      configured: false,
      reason: "missing",
    });
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
  }
});
