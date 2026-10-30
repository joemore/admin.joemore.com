import assert from "node:assert/strict";
import test from "node:test";
import { assertAssetId, assertMediaAccess, assertMediaOrigin, parseMediaQuery } from "../src/lib/media/http-policy";
import type { AccessState } from "../src/lib/auth/policy";
import { MediaError } from "../src/lib/media/types";

test("every Media API operation requires a verified active administrator", () => {
  for (const [status, code] of [["signed-out", 401], ["denied", 403], ["configuration", 503], ["unavailable", 503]] as const) {
    assert.throws(() => assertMediaAccess({ status }), (error) => error instanceof MediaError && error.status === code);
  }
  for (const role of ["super_admin", "admin", "editor"] as const) {
    const state: AccessState = { status: "admin", admin: { userId: "verified-user", email: "admin@example.invalid", role, createdAt: "2026-01-01T00:00:00Z" } };
    assert.equal(assertMediaAccess(state), state.admin);
  }
});

function mutation(headers: Record<string, string> = {}) {
  return new Request("https://admin-jg.joemore.com/api/media/uploads", { method: "POST", headers: { host: "admin-jg.joemore.com", origin: "https://admin-jg.joemore.com", "content-type": "application/json", ...headers }, body: "{}" });
}

test("mutations accept same-origin JSON and refuse cross-site/opaque requests", () => {
  assert.doesNotThrow(() => assertMediaOrigin(mutation()));
  assert.doesNotThrow(() => assertMediaOrigin(new Request("http://localhost:3000/api/media/uploads", { method: "POST", headers: { host: "localhost:3000", origin: "http://localhost:3000", "content-type": "application/json" }, body: "{}" })));
  const rejectedHeaders: Record<string, string>[] = [{ origin: "https://evil.example" }, { origin: "http://admin-jg.joemore.com" }, { origin: "null" }, { origin: "" }, { origin: "https://admin-jg.joemore.com.evil.example" }, { "sec-fetch-site": "cross-site" }];
  for (const headers of rejectedHeaders) {
    assert.throws(() => assertMediaOrigin(mutation(headers)), (error) => error instanceof MediaError && error.status === 403);
  }
  assert.throws(() => assertMediaOrigin(mutation({ "content-type": "multipart/form-data" })), (error) => error instanceof MediaError && error.status === 415);
});

test("query parser bounds pagination, filters and protects PostgREST logic syntax", () => {
  assert.deepEqual(parseMediaQuery(new URL("https://example.invalid/api/media")), { page: 1, type: "all", sort: "newest", search: "", pageSize: 24 });
  const query = parseMediaQuery(new URL("https://example.invalid/api/media?page=2&type=image&sort=name&search=hello%2Cstatus.eq.ready%25_test"));
  assert.equal(query.page, 2);
  assert.equal(query.type, "image");
  assert.equal(query.sort, "name");
  assert.equal(query.search, "hello status.eq.ready test");
  for (const suffix of ["page=0", "page=-1", "page=1.5", "page=1e2", "page=100001", "type=script", "sort=storage_key", `search=${"a".repeat(121)}`]) {
    assert.throws(() => parseMediaQuery(new URL(`https://example.invalid/api/media?${suffix}`)), MediaError);
  }
});

test("asset routes take UUIDs rather than client-supplied object paths", () => {
  assert.equal(assertAssetId("d48f40a3-3fb1-4a21-a977-707fe04dc29c"), "d48f40a3-3fb1-4a21-a977-707fe04dc29c");
  for (const id of ["../welcome.webp", "u/randomid1234.png", "", "00000000-0000-0000-0000-000000000000"]) assert.throws(() => assertAssetId(id), MediaError);
});
