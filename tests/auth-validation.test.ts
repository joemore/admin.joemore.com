import assert from "node:assert/strict";
import test from "node:test";
import { validateLogin } from "../src/lib/auth/validation";

function form(email: string, password: string) {
  const data = new FormData();
  data.set("email", email);
  data.set("password", password);
  return data;
}

test("empty inputs return field-level errors", () => {
  const result = validateLogin(new FormData());
  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.ok(result.fieldErrors.email);
    assert.ok(result.fieldErrors.password);
  }
});

test("malformed email is rejected", () => {
  assert.equal(validateLogin(form("invalid", "fixture-password")).valid, false);
});

test("email is trimmed but password spaces are preserved", () => {
  assert.deepEqual(
    validateLogin(form(" fixture@example.invalid ", "  test fixture  ")),
    {
      valid: true,
      email: "fixture@example.invalid",
      password: "  test fixture  ",
    },
  );
});

test("sign-in does not impose new-account password length rules", () => {
  assert.equal(
    validateLogin(form("fixture@example.invalid", "short")).valid,
    true,
  );
});

test("oversized passwords are rejected before sending to Auth", () => {
  assert.equal(
    validateLogin(form("fixture@example.invalid", "a".repeat(1025))).valid,
    false,
  );
});

test("non-string form values cannot become credentials", () => {
  const data = form("fixture@example.invalid", "fixture-password");
  data.set("password", new Blob(["fixture"]));
  assert.equal(validateLogin(data).valid, false);
});
