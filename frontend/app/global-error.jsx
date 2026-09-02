"use client";

/**
 * Root-layout error boundary. Rendered when even the layout crashes, so it
 * must provide its own <html>/<body> and cannot rely on global CSS.
 */
export default function GlobalError({ error, reset }) {
  // eslint-disable-next-line no-console
  console.error("[next:global-error]", error);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f4f7fb", color: "#1b365d" }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 420, width: "100%", background: "#fff", borderRadius: 12, padding: 28, textAlign: "center", boxShadow: "0 1px 0 rgba(27,54,93,0.06)" }}>
            <p style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>DukanSaathi khul nahi paya</p>
            <p style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>Aapka data safe hai. Page dobara load karein.</p>
            <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "center" }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ background: "#16a34a", color: "#fff", border: 0, borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}
              >
                Dobara try karein
              </button>
              <button
                type="button"
                onClick={() => window.location.reload()}
                style={{ background: "#fff", color: "#1b365d", border: "1px solid #d7dfea", borderRadius: 8, padding: "8px 14px", fontWeight: 600, cursor: "pointer" }}
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
