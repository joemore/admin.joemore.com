import assert from "node:assert/strict";

// No cookies, credentials, database writes, or R2 operations. Run against a
// configured local build: MEDIA_SMOKE_BASE_URL=http://127.0.0.1:3012 node ...
const base = process.env.MEDIA_SMOKE_BASE_URL || "http://127.0.0.1:3000";
const id = "d48f40a3-3fb1-4a21-a977-707fe04dc29c";
const cases = [
  ["GET", "/api/media"], ["GET", "/api/media/legacy"],
  ["GET", `/api/media/${id}/download`],
  ["POST", "/api/media/uploads"], ["POST", "/api/media/cleanup"],
  ["POST", `/api/media/uploads/${id}/parts`],
  ["POST", `/api/media/uploads/${id}/complete`],
  ["POST", `/api/media/uploads/${id}/abort`],
  ["PATCH", `/api/media/${id}`], ["DELETE", `/api/media/${id}`],
];
for (const [method, path] of cases) {
  const response = await fetch(`${base}${path}`, { method, redirect: "manual", headers: method === "GET" ? undefined : { "content-type": "application/json", origin: base }, body: method === "GET" ? undefined : "{}", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 401, `${method} ${path} must deny anonymous requests before any media operation`);
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
  const body = await response.json();
  assert.match(body.error, /Sign in/);
  console.log(`PASS anonymous ${method} ${path}: 401`);
}
const page = await fetch(`${base}/dashboard/media`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
assert.equal(page.status, 307);
assert.equal(page.headers.get("location"), "/login");
console.log("PASS anonymous /dashboard/media: redirect to login");
