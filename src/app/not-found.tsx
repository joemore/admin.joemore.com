import Link from "next/link";
import { ArrowLeft, Compass } from "lucide-react";

export default function NotFoundPage() {
  return (
    <main className="standalone-state" id="main-content">
      <span className="auth-icon">
        <Compass size={26} />
      </span>
      <span className="eyebrow">404 / OFF THE MAP</span>
      <h1>A little off course.</h1>
      <p>This page doesn’t exist. Let’s get you back to your workspace.</p>
      <Link href="/dashboard" className="button button-primary">
        <ArrowLeft size={16} />
        Back to workspace
      </Link>
    </main>
  );
}
