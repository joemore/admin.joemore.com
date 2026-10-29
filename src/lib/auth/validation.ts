export type LoginState = {
  error?: string;
  fieldErrors?: { email?: string; password?: string };
};
export type SignOutState = { error?: string };

type LoginValidation =
  | { valid: true; email: string; password: string }
  | { valid: false; fieldErrors: NonNullable<LoginState["fieldErrors"]> };

export function validateLogin(form: FormData): LoginValidation {
  const rawEmail = form.get("email");
  const rawPassword = form.get("password");
  const email = typeof rawEmail === "string" ? rawEmail.trim() : "";
  const password = typeof rawPassword === "string" ? rawPassword : "";
  const fieldErrors: NonNullable<LoginState["fieldErrors"]> = {};

  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    fieldErrors.email = "Enter a valid email address.";
  }
  // Existing account passwords are validated by Auth. Don't impose signup rules.
  if (!password.length) fieldErrors.password = "Enter your password.";
  else if (password.length > 1024)
    fieldErrors.password = "This password is too long.";

  return Object.keys(fieldErrors).length
    ? { valid: false, fieldErrors }
    : { valid: true, email, password };
}
