import type { Metadata } from "next";
import {
  CircleCheck,
  Fingerprint,
  KeyRound,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/access";
import { Badge } from "@/components/ui/badge";
import { CopyButton } from "@/components/ui/copy-button";
import { Panel } from "@/components/ui/panel";
import { roleLabel } from "@/components/ui/role-label";

export const metadata: Metadata = { title: "Access & security" };

export default async function AccessPage() {
  const admin = await requireAdmin();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ACCOUNT</span>
          <h1>
            Access & security<span className="accent-text">.</span>
          </h1>
          <p>A clear view of your workspace identity and permissions.</p>
        </div>
        <Badge tone="success" dot>
          Membership active
        </Badge>
      </div>
      <div className="access-grid">
        <Panel className="access-identity">
          <div className="panel-heading">
            <span className="small-icon">
              <Fingerprint size={19} />
            </span>
            <h2>Your identity</h2>
          </div>
          <p className="panel-description">
            Verified against your current administrator membership.
          </p>
          <dl className="details-list">
            <div>
              <dt>Email address</dt>
              <dd>{admin.email}</dd>
            </div>
            <div>
              <dt>Access level</dt>
              <dd>
                <Badge tone="accent">{roleLabel(admin.role)}</Badge>
              </dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd className="success-text">
                <CircleCheck size={15} />
                Active
              </dd>
            </div>
            <div>
              <dt>Auth user ID</dt>
              <dd>
                <code className="user-id">{admin.userId}</code>
                <CopyButton value={admin.userId} label="Copy your user ID" />
              </dd>
            </div>
            <div>
              <dt>Membership created</dt>
              <dd>
                {new Intl.DateTimeFormat("en", {
                  dateStyle: "long",
                  timeZone: "UTC",
                }).format(new Date(admin.createdAt))}
                <span className="subtle-label">UTC</span>
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel className="access-permissions">
          <div className="panel-heading">
            <span className="small-icon">
              <ShieldCheck size={18} />
            </span>
            <h2>Access by design</h2>
          </div>
          <div className="permission-item">
            <LockKeyhole size={18} />
            <div>
              <h3>Approved access only</h3>
              <p>
                Your account needs an active administrator membership to open
                this workspace.
              </p>
            </div>
          </div>
          <div className="permission-item">
            <KeyRound size={18} />
            <div>
              <h3>Managed with care</h3>
              <p>
                Membership and role changes are handled by a trusted database
                administrator.
              </p>
            </div>
          </div>
          <div className="permission-item">
            <Fingerprint size={18} />
            <div>
              <h3>Your identity stays yours</h3>
              <p>
                Your Auth user ID determines access. Account profile details
                cannot grant permissions.
              </p>
            </div>
          </div>
          <div className="access-note">
            Administrator management is planned for a future release.
          </div>
        </Panel>
      </div>
    </>
  );
}
