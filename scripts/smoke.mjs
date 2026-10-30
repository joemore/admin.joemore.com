import assert from "node:assert/strict";

// Run against the local app in a second terminal. No credentials or cookies used.
const base = "http://127.0.0.1:3000";
const cases = [
  ["/", 307, "/dashboard"],
  ["/dashboard", 307, "/login"],
  ["/dashboard/access", 307, "/login"],
  ["/access-denied", 307, "/login"],
  ["/login", 200],
  ["/connection-error", 200],
  ["/missing-page", 404],
];

for (const [path, status, location] of cases) {
  const response = await fetch(`${base}${path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, status, `${path}: unexpected status`);
  if (location)
    assert.equal(
      response.headers.get("location"),
      location,
      `${path}: unsafe redirect`,
    );
  assert.match(
    response.headers.get("cache-control") ?? "",
    /private.*no-store/,
    `${path}: private response must not be cached`,
  );
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-powered-by"), null);
  if (path === "/login") {
    const html = await response.text();
    assert.ok(html.includes("Welcome back."));
    assert.ok(
      !html.includes("Good to have you here"),
      "Private dashboard rendered for an anonymous request",
    );
    if (process.argv.includes("--expect-configuration")) {
      assert.ok(
        html.includes("Your workspace is almost ready"),
        "Missing configuration state is absent",
      );
      assert.match(html, /<button[^>]*disabled[^>]*>Sign in to your workspace/);
    }
    if (process.argv.includes("--expect-configured")) {
      assert.ok(
        !html.includes("Your workspace is almost ready"),
        "The image is missing its Supabase build configuration",
      );
      const submit = html.match(/<button\b[^>]*>Sign in to your workspace/);
      assert.ok(
        submit && !/\bdisabled(?:\s|=|>)/.test(submit[0]),
        "Sign-in should be enabled",
      );
    }
    const stylesheet = html.match(
      /href="(\/_next\/static\/[^\"]+\.css(?:\?[^\"]*)?)"/,
    );
    assert.ok(stylesheet, "Login page must reference a built stylesheet");
    const asset = await fetch(
      `${base}${stylesheet[1].replaceAll("&amp;", "&")}`,
      { signal: AbortSignal.timeout(30_000) },
    );
    assert.equal(
      asset.status,
      200,
      "Standalone image must serve its static assets",
    );
    assert.match(asset.headers.get("content-type") ?? "", /text\/css/);
    await asset.body?.cancel();
  } else {
    await response.body?.cancel();
  }
  console.log(`PASS ${path}: ${status}${location ? ` → ${location}` : ""}`);
}
