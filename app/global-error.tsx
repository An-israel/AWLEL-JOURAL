"use client";

// Last-resort error page when the root layout itself fails. It can't use the
// site's layout or styles, so it is plain and self-contained.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          padding: "4rem 1rem",
          background: "#f7f7f8",
          color: "#111",
        }}
      >
        <main style={{ maxWidth: 640, margin: "0 auto" }}>
          <p
            style={{
              color: "#c42d45",
              fontWeight: 600,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
              fontSize: 14,
            }}
          >
            AWLEL
          </p>
          <h1 style={{ fontSize: 32 }}>The journal&rsquo;s website is having a problem</h1>
          <p style={{ color: "#4a4a52", lineHeight: 1.6 }}>Please try again in a few minutes.</p>
          {error.digest ? (
            <p style={{ color: "#4a4a52", fontSize: 14 }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "12px 20px",
              background: "#1e3a8a",
              color: "#fff",
              border: 0,
              borderRadius: 6,
              fontSize: 16,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
