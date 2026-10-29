"use client";

import Link from "next/link";
import { RotateCcw, TriangleAlert } from "lucide-react";

export default function ErrorPage({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="standalone-state" id="main-content">
      <span className="auth-icon">
        <TriangleAlert size={26} />
      </span>
      <span className="eyebrow">SOMETHING WENT WRONG</span>
      <h1>A small interruption.</h1>
      <p>We couldn’t load this part of your workspace. Please try again.</p>
      <button type="button" className="button button-primary" onClick={reset}>
        <RotateCcw size={16} />
        Try again
      </button>
      <Link className="text-link" href="/login">
        Return to sign in
      </Link>
    </main>
  );
}
