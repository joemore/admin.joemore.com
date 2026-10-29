import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleCheck,
  FileText,
  Fingerprint,
  ImageIcon,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Terminal,
  Waypoints,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth/access";
import { Badge } from "@/components/ui/badge";
import { Panel } from "@/components/ui/panel";
import { roleLabel } from "@/components/ui/role-label";

export const metadata: Metadata = { title: "Overview" };

export default async function DashboardPage() {
  // Each page checks access independently; layouts may be reused during navigation.
  const admin = await requireAdmin();
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YOUR ADMIN WORKSPACE</span>
          <h1>
            Good to have you here<span className="accent-text">.</span>
          </h1>
          <p>A little clarity. A clear view of what’s next.</p>
        </div>
        <Badge tone="success" dot>
          Access verified
        </Badge>
      </div>
      <section className="dashboard-hero">
        <div className="hero-grid" aria-hidden="true" />
        <div className="hero-content">
          <span className="hero-kicker">
            <Sparkles size={14} />
            THE BEGINNING OF MORE
          </span>
          <h2>
            Everything starts with
            <br />a good foundation.
          </h2>
          <p>
            Your private workspace is ready. A considered space
            <br className="desktop-break" /> to manage, create, and build what
            comes next.
          </p>
          <Link href="/dashboard/access" className="hero-link">
            Explore your workspace
            <ArrowUpRight size={16} />
          </Link>
        </div>
        <div className="hero-orbit" aria-hidden="true">
          <div className="orbit-ring ring-one" />
          <div className="orbit-ring ring-two" />
          <div className="orbit-core">
            <span>
              jm<span className="accent-text">.</span>
            </span>
          </div>
          <div className="orbit-node node-one">
            <Layers3 size={20} />
          </div>
          <div className="orbit-node node-two">
            <ShieldCheck size={21} />
          </div>
          <div className="orbit-node node-three">
            <Waypoints size={19} />
          </div>
          <span className="orbit-star star-one">+</span>
          <span className="orbit-star star-two">+</span>
        </div>
        <span className="hero-edition font-mono">FOUNDATION / 001</span>
      </section>
      <div className="stat-grid">
        <Panel className="stat-card">
          <div className="stat-title">
            <span>Your access</span>
            <ShieldCheck size={17} />
          </div>
          <strong>{roleLabel(admin.role)}</strong>
          <p>
            <span className="status-dot" />
            Active administrator membership
          </p>
        </Panel>
        <Panel className="stat-card">
          <div className="stat-title">
            <span>Authentication</span>
            <Fingerprint size={18} />
          </div>
          <strong>Verified session</strong>
          <p>Confirmed securely with Supabase Auth</p>
        </Panel>
        <Panel className="stat-card">
          <div className="stat-title">
            <span>Workspace release</span>
            <Terminal size={17} />
          </div>
          <strong className="font-mono">
            v0.0.1<span className="stat-inline-label">Foundation</span>
          </strong>
          <p>A focused start. Room to grow.</p>
        </Panel>
      </div>
      <div className="dashboard-columns">
        <div className="dashboard-primary">
          <div className="section-heading">
            <div>
              <h2>Your workspace</h2>
              <p>The essentials, with more to come.</p>
            </div>
            <Badge>2 planned modules</Badge>
          </div>
          <div className="module-grid">
            <Panel className="module-card">
              <span className="module-icon">
                <FileText size={22} strokeWidth={1.5} />
              </span>
              <Badge>Coming later</Badge>
              <h3>Content</h3>
              <p>
                A home for your ideas, pages, and stories. Built around the way
                you work.
              </p>
              <div className="module-footer">
                <span>Not available in this release</span>
                <LockKeyhole size={13} />
              </div>
            </Panel>
            <Panel className="module-card">
              <span className="module-icon module-icon-violet">
                <ImageIcon size={22} strokeWidth={1.5} />
              </span>
              <Badge>Coming later</Badge>
              <h3>Media library</h3>
              <p>
                Your visual world, thoughtfully organised. One place for every
                asset.
              </p>
              <div className="module-footer">
                <span>Not available in this release</span>
                <LockKeyhole size={13} />
              </div>
            </Panel>
          </div>
          <Panel className="activity-panel">
            <div className="section-heading">
              <h2>Workspace activity</h2>
              <span className="subtle-label">A FRESH START</span>
            </div>
            <div className="empty-state">
              <span className="empty-icon">
                <Waypoints size={25} strokeWidth={1.4} />
              </span>
              <h3>A clean slate.</h3>
              <p>
                Activity will have a home here as your workspace grows.
                <br />
                There’s nothing to report just yet.
              </p>
            </div>
          </Panel>
        </div>
        <div className="dashboard-secondary">
          <Panel className="foundation-panel">
            <div className="panel-heading">
              <span className="small-icon">
                <ShieldCheck size={17} />
              </span>
              <h2>A secure foundation</h2>
            </div>
            <p className="panel-description">
              The right access, from the start.
            </p>
            <ul className="foundation-list">
              <li>
                <span className="check-circle">
                  <Check size={12} />
                </span>
                <div>
                  <strong>Identity confirmed</strong>
                  <p>Server-verified authentication</p>
                </div>
              </li>
              <li>
                <span className="check-circle">
                  <Check size={12} />
                </span>
                <div>
                  <strong>Membership active</strong>
                  <p>Your current administrator record</p>
                </div>
              </li>
              <li>
                <span className="check-circle">
                  <Check size={12} />
                </span>
                <div>
                  <strong>User-scoped requests</strong>
                  <p>Connected with your own session</p>
                </div>
              </li>
            </ul>
            <Link href="/dashboard/access" className="panel-bottom-link">
              View access & security
              <ArrowRight size={15} />
            </Link>
          </Panel>
          <Panel className="account-panel">
            <span className="subtle-label">YOUR WORKSPACE IDENTITY</span>
            <div className="identity-preview">
              <span className="avatar avatar-large">
                {admin.email.charAt(0).toUpperCase() || "A"}
              </span>
              <div>
                <strong>{admin.email}</strong>
                <span>{roleLabel(admin.role)}</span>
              </div>
              <CircleCheck size={16} className="success-text" />
            </div>
            <p>
              This workspace is connected to your approved administrator
              account.
            </p>
            <Link href="/dashboard/access" className="text-link">
              Account details
              <ArrowUpRight size={14} />
            </Link>
          </Panel>
          <div className="quiet-note">
            <LockKeyhole size={14} />
            <p>
              A private space for joemore.com.
              <br />
              Only approved administrators can enter.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
