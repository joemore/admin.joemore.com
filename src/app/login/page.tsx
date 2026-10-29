import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, ChevronDown, KeyRound, ShieldCheck } from "lucide-react";
import { getAccessState } from "@/lib/auth/access";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { AuthFrame } from "@/components/auth/auth-frame";
import { LoginForm } from "@/components/auth/login-form";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const config = getSupabaseConfig();
  const access = await getAccessState();
  if (access.status === "admin") redirect("/dashboard");
  if (access.status === "denied") redirect("/access-denied");
  return (
    <AuthFrame>
      <div className="auth-icon">
        <ShieldCheck size={24} strokeWidth={1.7} />
      </div>
      <Badge tone="accent">JOEMORE.COM ADMIN</Badge>
      <h2>Welcome back.</h2>
      <p className="auth-description">
        A little focus. A lot of possibility.
        <br />
        Sign in to your private workspace.
      </p>
      {!config.configured && (
        <div className="configuration-notice">
          <div className="notice-title">
            <KeyRound size={16} />
            <strong>Your workspace is almost ready</strong>
          </div>
          <p>
            {config.reason === "missing"
              ? "Add your Supabase connection to enable sign in."
              : "Check your Supabase URL and anon key to enable sign in."}
          </p>
          <details>
            <summary>
              View setup steps
              <ChevronDown size={13} />
            </summary>
            <ol>
              <li>
                Copy <code>.env.example</code> to <code>.env.local</code>.
              </li>
              <li>
                Set <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your existing anon key.
              </li>
              <li>Install the SQL and add your administrator UUID.</li>
              <li>Restart the development server.</li>
            </ol>
            <p className="notice-reference">
              The project README has the full setup guide.
              <ArrowRight size={12} />
            </p>
          </details>
        </div>
      )}
      {access.status === "unavailable" && (
        <p className="form-alert" role="alert">
          We couldn’t confirm your session. Check your connection and try
          signing in again.
        </p>
      )}
      <LoginForm configured={config.configured} />
      <div className="auth-help">
        Need access? Contact your workspace owner.
        <br />
        Your account must be set up in advance.
      </div>
    </AuthFrame>
  );
}
