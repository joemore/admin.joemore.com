export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading workspace" className="loading-state">
      <span className="sr-only">Loading your workspace…</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-text" />
      <div className="skeleton skeleton-hero" />
      <div className="stat-grid">
        {[1, 2, 3].map((i) => (
          <div key={i} className="skeleton skeleton-card" />
        ))}
      </div>
      <div className="skeleton skeleton-content" />
    </div>
  );
}
