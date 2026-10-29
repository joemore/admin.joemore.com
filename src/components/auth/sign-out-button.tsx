"use client";

import { useActionState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { signOutAction, type SignOutState } from "@/app/auth/actions";

const initialState: SignOutState = {};

export function SignOutButton({ compact = false }: { compact?: boolean }) {
  const [state, action, pending] = useActionState(signOutAction, initialState);
  return (
    <form action={action} className="sign-out-form">
      <button
        type="submit"
        className="sign-out-button"
        disabled={pending}
        aria-label={pending ? "Signing out" : "Sign out"}
        title="Sign out"
      >
        {pending ? (
          <LoaderCircle size={17} className="spin" />
        ) : (
          <LogOut size={17} />
        )}
        {!compact && <span>{pending ? "Signing out…" : "Sign out"}</span>}
      </button>
      {state.error && (
        <p className="field-error sign-out-error" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
