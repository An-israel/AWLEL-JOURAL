import { ImageResponse } from "next/og";

// Auto-generated social images for issues and articles (section 11), in the
// brand style: navy ground with the cover's diagonal blue, black and gold
// bands in one corner.

export const OG_SIZE = { width: 1200, height: 630 };

const NAVY = "#1E3A8A";
const NAVY_DEEP = "#152A66";
const GOLD = "#C99234";
const ROYAL = "#2E66E8";

function clamp(text: string, max: number) {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export function brandedImage({
  eyebrow,
  title,
  lines = [],
  footer,
  coverUrl,
}: {
  eyebrow: string;
  title: string;
  lines?: string[];
  footer: string;
  coverUrl?: string | null;
}) {
  const long = title.length > 90;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        color: "white",
        position: "relative",
        fontFamily: "Geist",
      }}
    >
      {/* Diagonal bands, as on the printed covers. */}
      <div
        style={{
          position: "absolute",
          right: -160,
          top: -40,
          width: 520,
          height: 70,
          background: ROYAL,
          transform: "rotate(-35deg)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -170,
          top: 50,
          width: 520,
          height: 34,
          background: "#111111",
          transform: "rotate(-35deg)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -190,
          top: 110,
          width: 520,
          height: 22,
          background: GOLD,
          transform: "rotate(-35deg)",
          display: "flex",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          flex: 1,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 26,
              letterSpacing: 4,
              color: GOLD,
              textTransform: "uppercase",
            }}
          >
            {clamp(eyebrow, 70)}
          </div>
          <div style={{ display: "flex", width: 90, height: 4, background: GOLD, marginTop: 22 }} />
          <div
            style={{
              display: "flex",
              marginTop: 30,
              fontSize: long ? 50 : 62,
              lineHeight: 1.15,
              maxWidth: coverUrl ? 760 : 980,
            }}
          >
            {clamp(title, 150)}
          </div>
          {lines.map((line) => (
            <div key={line} style={{ display: "flex", marginTop: 18, fontSize: 28, color: "#D9E1F5" }}>
              {clamp(line, 80)}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: "#D9E1F5" }}>{footer}</div>
      </div>
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={coverUrl}
          alt=""
          width={270}
          height={382}
          style={{
            position: "absolute",
            right: 80,
            bottom: 70,
            borderRadius: 6,
            boxShadow: "0 20px 40px rgba(0,0,0,.4)",
          }}
        />
      ) : null}
    </div>,
    OG_SIZE,
  );
}
