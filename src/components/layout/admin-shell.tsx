"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowUpRight,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  FileText,
  ImageIcon,
  LayoutDashboard,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { AdminIdentity } from "@/lib/auth/access";
import { Brand } from "@/components/ui/brand";
import { Badge } from "@/components/ui/badge";
import { roleLabel } from "@/components/ui/role-label";
import { SignOutButton } from "@/components/auth/sign-out-button";

function Navigation({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  return (
    <nav className="sidebar-nav" aria-label="Main navigation">
      <span className="nav-section-label">WORKSPACE</span>
      <Link
        onClick={onNavigate}
        className={`nav-item ${pathname === "/dashboard" ? "active" : ""}`}
        aria-current={pathname === "/dashboard" ? "page" : undefined}
        href="/dashboard"
        title={compact ? "Overview" : undefined}
      >
        <LayoutDashboard size={18} />
        <span>Overview</span>
        {!compact && pathname === "/dashboard" && (
          <span className="nav-active-dot" />
        )}
      </Link>
      <span className="nav-section-label nav-section-spaced">MANAGE</span>
      <button
        type="button"
        className="nav-item nav-disabled"
        disabled
        title="Content is planned for a future release"
      >
        <FileText size={18} />
        <span>Content</span>
        <small>Soon</small>
      </button>
      <Link
        onClick={onNavigate}
        className={`nav-item ${pathname === "/dashboard/media" ? "active" : ""}`}
        aria-current={pathname === "/dashboard/media" ? "page" : undefined}
        href="/dashboard/media"
        title={compact ? "Media library" : undefined}
      >
        <ImageIcon size={18} />
        <span>Media library</span>
      </Link>
      <Link
        onClick={onNavigate}
        className={`nav-item ${pathname.startsWith("/photography") ? "active" : ""}`}
        aria-current={pathname.startsWith("/photography") ? "page" : undefined}
        href="/photography"
        title={compact ? "Photography" : undefined}
      >
        <Camera size={18} />
        <span>Photography</span>
      </Link>
      <span className="nav-section-label nav-section-spaced">
        ADMINISTRATION
      </span>
      <Link
        onClick={onNavigate}
        className={`nav-item ${pathname === "/dashboard/access" ? "active" : ""}`}
        aria-current={pathname === "/dashboard/access" ? "page" : undefined}
        href="/dashboard/access"
        title={compact ? "Access & security" : undefined}
      >
        <ShieldCheck size={18} />
        <span>Access & security</span>
      </Link>
    </nav>
  );
}

export function AdminShell({
  admin,
  children,
}: {
  admin: AdminIdentity;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  const title = pathname === "/dashboard/access"
    ? "Access & security"
    : pathname.startsWith("/photography") ? "Photography"
    : pathname === "/dashboard/media" ? "Media library" : "Overview";
  const initial = (admin.email.charAt(0) || "A").toUpperCase();
  return (
    <div className={`admin-shell ${collapsed ? "shell-collapsed" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Brand compact={collapsed} />
        </div>
        <Navigation compact={collapsed} />
        <div className="sidebar-bottom">
          {!collapsed && (
            <div className="sidebar-note">
              <span className="sidebar-note-icon">
                <Sparkles size={16} />
              </span>
              <strong>Room for what’s next.</strong>
              <p>
                A focused foundation.
                <br />
                Built to grow with you.
              </p>
              <span className="font-mono">v0.0.3</span>
            </div>
          )}
          <a
            href="https://joemore.com"
            target="_blank"
            rel="noopener noreferrer"
            className="nav-item"
            title={collapsed ? "Visit joemore.com" : undefined}
          >
            <ArrowUpRight size={18} />
            <span>Visit website</span>
          </a>
          <button
            type="button"
            className="nav-item collapse-button"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={18} />
            ) : (
              <PanelLeftClose size={18} />
            )}
            <span>Collapse sidebar</span>
          </button>
          <div className="sidebar-version">
            <span className="status-dot" />
            {!collapsed && <span>Private workspace</span>}
          </div>
        </div>
      </aside>
      <dialog
        ref={dialogRef}
        className="mobile-navigation"
        aria-label="Workspace navigation"
      >
        <div className="mobile-nav-heading">
          <Brand />
          <button
            type="button"
            className="icon-button"
            aria-label="Close navigation"
            onClick={() => dialogRef.current?.close()}
          >
            <X size={20} />
          </button>
        </div>
        <Navigation onNavigate={() => dialogRef.current?.close()} />
        <div className="mobile-nav-footer">
          <SignOutButton />
        </div>
      </dialog>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <button
              type="button"
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => dialogRef.current?.showModal()}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight size={14} />
            <span>{title}</span>
          </div>
          <div className="topbar-right">
            <Badge tone="neutral" dot>
              Private
            </Badge>
            <span className="topbar-divider" />
            <details className="account-menu">
              <summary aria-label={`Account menu for ${admin.email}`}>
                <span className="avatar">{initial}</span>
                <span className="account-summary">
                  <strong>{admin.email}</strong>
                  <small>{roleLabel(admin.role)}</small>
                </span>
                <ChevronDown size={14} />
              </summary>
              <div className="account-dropdown">
                <span className="dropdown-label">SIGNED IN AS</span>
                <strong>{admin.email}</strong>
                <span>{roleLabel(admin.role)}</span>
                <Link href="/dashboard/access">
                  <ShieldCheck size={15} />
                  Access & security
                </Link>
                <SignOutButton />
              </div>
            </details>
          </div>
        </header>
        <main id="main-content" className="workspace-main">
          {children}
        </main>
        <footer className="workspace-footer">
          <span>Made for a little more.</span>
          <span>
            joemore.com Admin<span className="footer-separator">/</span>
            <span className="font-mono">v0.0.3</span>
          </span>
          <Link
            href="/dashboard/access"
            aria-label="View access and security information"
          >
            <CircleHelp size={15} />
          </Link>
        </footer>
      </div>
    </div>
  );
}
