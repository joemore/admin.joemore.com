import assert from "node:assert/strict";

// Anonymous only: no credentials, database writes, original downloads or R2 calls.
const base = process.env.PHOTOGRAPHY_SMOKE_BASE_URL || "http://127.0.0.1:3000";
const id = "d48f40a3-3fb1-4a21-a977-707fe04dc29c";
const cases = [
  ["GET", ""], ["GET", "/catalog"], ["GET", `/${id}`], ["PATCH", `/${id}`],
  ["POST", "/uploads"], ["POST", `/uploads/${id}/parts`], ["POST", `/uploads/${id}/complete`], ["POST", `/uploads/${id}/abort`],
  ["POST", `/${id}/publish`], ["GET", `/${id}/download`], ["POST", "/cleanup"], ["POST", "/bulk"],
  ["POST", "/tags"], ["PATCH", `/tags/${id}`], ["GET", "/albums"], ["POST", "/albums"], ["PATCH", `/albums/${id}`], ["DELETE", `/albums/${id}`], ["GET", `/albums/${id}/items`], ["PUT", `/albums/${id}/items`],
];
for (const [method, path] of cases) {
  const response = await fetch(`${base}/api/photography${path}`, { method, redirect: "manual", headers: method === "GET" ? undefined : { "content-type": "application/json", origin: base }, body: method === "GET" ? undefined : "{}", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 401, `${method} ${path} must deny anonymous access before privileged work`);
  assert.match(response.headers.get("cache-control") || "", /private.*no-store/);
  assert.match((await response.json()).error, /Sign in/);
  console.log(`PASS anonymous ${method} /api/photography${path}: 401`);
}
for (const path of ["/photography", "/photography/upload", "/photography/albums"]) {
  const response = await fetch(`${base}${path}`, { redirect: "manual", signal: AbortSignal.timeout(15000) });
  assert.equal(response.status, 307); assert.equal(response.headers.get("location"), "/login");
  console.log(`PASS anonymous ${path}: redirect to login`);
}
