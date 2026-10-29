import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CloudOff } from "lucide-react";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Connection unavailable" };
export const dynamic = "force-dynamic";

export default function ConnectionErrorPage() {
  return (
    <AuthFrame>
      <div className="auth-icon">
        <CloudOff size={26} />
      </div>
      <Badge tone="warning">CONNECTION UNAVAILABLE</Badge>
      <h2>Let’s reconnect.</h2>
      <p className="auth-description">
        We couldn’t securely confirm your access. Your workspace will be here
        when the connection is back.
      </p>
      <div className="configuration-notice">
        <p>
          Try again in a moment. If this continues, check your Supabase
          connection, API key support, and installed database schema.
        </p>
      </div>
      <Link href="/dashboard" className="button button-primary">
        Try again
        <ArrowRight size={16} />
      </Link>
      <div className="state-actions">
        <SignOutButton />
      </div>
    </AuthFrame>
  );
}
