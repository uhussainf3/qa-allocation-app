export default function Loading() {
  return (
    <div className="page">
      {/* Page header skeleton */}
      <div className="page-head">
        <div>
          <div style={sk(200, 28, 6)} />
          <div style={{ ...sk(120, 14, 4), marginTop: 8 }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={sk(90, 30, 6)} />
          <div style={sk(90, 30, 6)} />
        </div>
      </div>

      {/* KPI strip skeleton */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[140, 160, 150, 130].map((w, i) => (
          <div key={i} style={sk(w, 72, 10)} />
        ))}
      </div>

      {/* Main content card skeleton */}
      <div className="card" style={{ overflow: "hidden" }}>
        {/* Table header */}
        <div style={{
          display: "flex", gap: 0,
          background: "var(--surface-2)",
          borderBottom: "1px solid var(--border)",
          padding: "10px 14px",
        }}>
          {[180, 140, 100, 100, 80, 80].map((w, i) => (
            <div key={i} style={{ ...sk(w, 12, 3), marginRight: 32 }} />
          ))}
        </div>

        {/* Table rows */}
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 0,
              padding: "12px 14px",
              borderBottom: i < 7 ? "1px solid var(--border)" : "none",
            }}
          >
            {/* Avatar + name */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginRight: 32, width: 180 }}>
              <div style={sk(28, 28, 50)} />
              <div>
                <div style={sk(90 + (i % 3) * 20, 13, 4)} />
                <div style={{ ...sk(60, 10, 3), marginTop: 5 }} />
              </div>
            </div>
            {/* Other columns */}
            {[120, 90, 90, 60, 50].map((w, j) => (
              <div key={j} style={{ ...sk(w - (i % 2) * 10, 13, 3), marginRight: 32 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shimmer skeleton style helper */
function sk(width: number, height: number, radius = 4): React.CSSProperties {
  return {
    width,
    height,
    borderRadius: radius,
    background: "linear-gradient(90deg, var(--surface-2) 25%, var(--border) 50%, var(--surface-2) 75%)",
    backgroundSize: "200% 100%",
    animation: "shimmer 1.4s infinite",
    flexShrink: 0,
  };
}
