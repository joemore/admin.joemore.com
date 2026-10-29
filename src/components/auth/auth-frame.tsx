import type { ReactNode } from "react";
import {
  ArrowUpRight,
  CircleCheck,
  Layers3,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Brand } from "@/components/ui/brand";

export function AuthFrame({ children }: { children: ReactNode }) {
  return (
    <div className="auth-layout">
      <section className="auth-story" aria-label="About your workspace">
        <div className="auth-grid" aria-hidden="true" />
        <Brand href="/login" />
        <div className="auth-story-content">
          <span className="eyebrow">
            <span className="eyebrow-line" />A SPACE TO MAKE THINGS HAPPEN
          </span>
          <h1>
            Your workspace.
            <br />
            <span>Under control.</span>
          </h1>
          <p>
            A thoughtful home for everything behind
            <br className="desktop-break" /> joemore.com. Simple, focused, and
            yours.
          </p>
          <div className="workspace-art" aria-hidden="true">
            <div className="art-topline">
              <span className="art-window-dots">
                <i />
                <i />
                <i />
              </span>
              <span>joemore.com / workspace</span>
              <LockKeyhole size={12} />
            </div>
            <div className="art-body">
              <div className="art-sidebar">
                <span className="art-mini-logo">jm.</span>
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="art-main">
                <div className="art-greeting">
                  <span>Everything in its place.</span>
                  <Sparkles size={16} />
                </div>
                <div className="art-cards">
                  <div>
                    <Layers3 size={18} />
                    <span className="art-line" />
                    <span className="art-line short" />
                  </div>
                  <div>
                    <ShieldCheck size={18} />
                    <span className="art-line" />
                    <span className="art-line short" />
                  </div>
                </div>
                <div className="art-bottom">
                  <span className="art-line" />
                  <span className="art-line short" />
                  <span className="art-line" />
                </div>
              </div>
            </div>
            <div className="art-floating-badge">
              <CircleCheck size={16} />
              <span>Built on a secure foundation</span>
            </div>
          </div>
        </div>
        <div className="auth-story-footer">
          <span>One workspace. More possibilities.</span>
          <a
            href="https://joemore.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            joemore.com
            <ArrowUpRight size={13} />
          </a>
        </div>
      </section>
      <main id="main-content" className="auth-main">
        <div className="auth-mobile-brand">
          <Brand href="/login" />
        </div>
        <div className="auth-card">{children}</div>
        <footer className="auth-main-footer">
          <span className="status-dot" />
          Private workspace<span className="footer-separator">/</span>
          <span className="font-mono">v0.0.1</span>
        </footer>
      </main>
    </div>
  );
}
