"use client";

import { useActionState, useState } from "react";
import {
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { signInAction, type LoginState } from "@/app/auth/actions";

const initialState: LoginState = {};

export function LoginForm({ configured }: { configured: boolean }) {
  const [state, action, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  return (
    <form action={action} className="login-form">
      <div className="field-group">
        <label htmlFor="email">Email address</label>
        <div className="input-wrap">
          <Mail size={17} aria-hidden="true" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@example.com"
            required
            maxLength={254}
            disabled={!configured || pending}
            aria-invalid={!!state.fieldErrors?.email}
            aria-describedby={
              state.fieldErrors?.email ? "email-error" : undefined
            }
          />
        </div>
        {state.fieldErrors?.email && (
          <p className="field-error" id="email-error">
            {state.fieldErrors.email}
          </p>
        )}
      </div>
      <div className="field-group">
        <label htmlFor="password">Password</label>
        <div className="input-wrap">
          <LockKeyhole size={17} aria-hidden="true" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Enter your password"
            required
            maxLength={1024}
            disabled={!configured || pending}
            aria-invalid={!!state.fieldErrors?.password}
            aria-describedby={
              state.fieldErrors?.password ? "password-error" : undefined
            }
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword(!showPassword)}
            disabled={!configured}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
          >
            {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
          </button>
        </div>
        {state.fieldErrors?.password && (
          <p className="field-error" id="password-error">
            {state.fieldErrors.password}
          </p>
        )}
      </div>
      {state.error && (
        <p className="form-alert" role="alert">
          {state.error}
        </p>
      )}
      <button
        className="button button-primary login-submit"
        type="submit"
        disabled={!configured || pending}
      >
        {pending ? (
          <>
            <LoaderCircle size={17} className="spin" />
            Signing in…
          </>
        ) : (
          <>
            Sign in to your workspace
            <ArrowRight size={17} />
          </>
        )}
      </button>
      <p className="login-access-note">
        <LockKeyhole size={12} aria-hidden="true" />
        Access is limited to approved administrators.
      </p>
    </form>
  );
}
