import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldX } from "lucide-react";
import { getAccessState } from "@/lib/auth/access";
import { AuthFrame } from "@/components/auth/auth-frame";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Badge } from "@/components/ui/badge";

export const metadata: Metadata = { title: "Access restricted" };
export const dynamic = "force-dynamic";

export default async function AccessDeniedPage() {
  const access = await getAccessState();
  if (access.status === "admin") redirect("/dashboard");
  if (access.status === "signed-out" || access.status === "configuration")
    redirect("/login");
  if (access.status === "unavailable") redirect("/connection-error");
  return (
    <AuthFrame>
      <div className="auth-icon">
        <ShieldX size={26} />
      </div>
      <Badge tone="warning">ACCESS RESTRICTED</Badge>
      <h2>A private space.</h2>
      <p className="auth-description">
        You’re signed in, but this account doesn’t have active administrator
        access.
      </p>
      <div className="configuration-notice">
        <p>
          Ask the workspace owner to check your administrator membership. Access
          must be granted by a trusted database administrator.
        </p>
      </div>
      <div className="state-actions">
        <SignOutButton />
        <Link href="/dashboard" className="text-link">
          Check access again
        </Link>
      </div>
    </AuthFrame>
  );
}
