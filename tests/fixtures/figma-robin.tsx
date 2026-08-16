import { useMemo } from "react";

const CIRCLE_D = 220;
const ARM_COUNT = 8;
const CYCLE = 10; // seconds per full fleur cycle

// ------------------------------------------------------------------
// Flower portal — 5 petals arranged radially, Robin's Hana Hana mark
// ------------------------------------------------------------------
function FlowerPortal({ scale = 1 }: { scale?: number }) {
  const s = 24 * scale;
  return (
    <svg
      width={s}
      height={s}
      viewBox="-12 -12 24 24"
      style={{ display: "block", margin: "0 auto" }}
    >
      {[0, 72, 144, 216, 288].map((a) => {
        const rad = (a * Math.PI) / 180;
        const cx = Math.cos(rad) * 5.5;
        const cy = Math.sin(rad) * 5.5;
        return (
          <ellipse
            key={a}
            cx={cx}
            cy={cy}
            rx="5"
            ry="2.6"
            transform={`rotate(${a} ${cx} ${cy})`}
            fill="#c4b5fd"
            opacity="0.88"
          />
        );
      })}
      <circle r="3" fill="#7c3aed" />
      <circle r="1.4" fill="#ede9fe" opacity="0.7" />
    </svg>
  );
}

// ------------------------------------------------------------------
// Arm + hand — silhouette of Robin's feminine outstretched hand
// viewBox y: -56 = fingertips (outward), 0 = wrist (circle edge)
// ------------------------------------------------------------------
function ArmHand({ armScale = 1 }: { armScale?: number }) {
  const w = Math.round(26 * armScale);
  const h = Math.round(56 * armScale);
  const f = "#1a0535";
  const s = "#8b5cf6";
  const sw = 0.7;
  return (
    <svg
      width={w}
      height={h}
      viewBox="-13 -56 26 56"
      style={{ display: "block", margin: "0 auto" }}
    >
      {/* Arm shaft */}
      <rect x="-3.5" y="-36" width="7" height="36" rx="3.5" fill={f} stroke={s} strokeWidth={sw} />
      {/* Palm */}
      <ellipse cx="0" cy="-39" rx="8" ry="5.5" fill={f} stroke={s} strokeWidth={sw} />
      {/* Middle finger — tallest */}
      <rect x="-2" y="-55" width="4" height="18" rx="2" fill={f} stroke={s} strokeWidth={sw} />
      {/* Index finger */}
      <rect x="-7" y="-53" width="4" height="16" rx="2" fill={f} stroke={s} strokeWidth={sw} />
      {/* Ring finger */}
      <rect x="3" y="-53" width="4" height="16" rx="2" fill={f} stroke={s} strokeWidth={sw} />
      {/* Pinky */}
      <rect x="7.5" y="-49" width="3.5" height="13" rx="1.75" fill={f} stroke={s} strokeWidth={sw} />
      {/* Thumb — angled outward */}
      <g transform="rotate(-22 -10 -41)">
        <rect x="-13" y="-49" width="3.5" height="12" rx="1.75" fill={f} stroke={s} strokeWidth={sw} />
      </g>
    </svg>
  );
}

// ------------------------------------------------------------------
// Main component
// ------------------------------------------------------------------
export default function App() {
  const arms = useMemo(
    () =>
      Array.from({ length: ARM_COUNT }, (_, i) => ({
        angle: i * (360 / ARM_COUNT),
        // negative delays so arms phase in at different points immediately on load
        delay: -(i * (CYCLE / ARM_COUNT)),
        armScale: 0.78 + (i % 3) * 0.14, // subtle size variation per arm
      })),
    []
  );

  return (
    <>
      <style>{`
        @keyframes ringSpin {
          to { transform: rotate(360deg); }
        }
        @keyframes ringSpinR {
          to { transform: rotate(-360deg); }
        }
        @keyframes fleurCycle {
          0%    { opacity: 0; transform: scale(0.06); }
          8%    { opacity: 1; transform: scale(1); }
          42%   { opacity: 1; transform: scale(1); }
          54%   { opacity: 0; transform: scale(0.06); }
          100%  { opacity: 0; transform: scale(0.06); }
        }
        @keyframes ambientBreath {
          0%, 100% { opacity: 0.32; transform: scale(1); }
          50%       { opacity: 0.52; transform: scale(1.06); }
        }
        @keyframes avatarGlow {
          0%, 100% { box-shadow: inset 0 0 28px rgba(124, 58, 237, 0.12); }
          50%       { box-shadow: inset 0 0 52px rgba(139, 92, 246, 0.28); }
        }
      `}</style>

      <div
        className="relative w-full h-screen overflow-hidden flex items-center justify-center"
        style={{ background: "#07050f" }}
      >
        {/* Distant ambient bloom — evokes the dark mystery of Robin's past */}
        <div
          style={{
            position: "absolute",
            width: 560,
            height: 560,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, #1a0535 0%, #0d0522 40%, transparent 70%)",
            animation: "ambientBreath 10s ease-in-out infinite",
            pointerEvents: "none",
          }}
        />
        {/* Secondary bloom — offset, for depth */}
        <div
          style={{
            position: "absolute",
            width: 300,
            height: 300,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, #2e0c5e 0%, transparent 70%)",
            transform: "translate(60px, -50px)",
            opacity: 0.25,
            pointerEvents: "none",
          }}
        />

        {/* ── Profile circle ── */}
        <div style={{ position: "relative", width: CIRCLE_D, height: CIRCLE_D }}>
          {/* Outer diffuse glow ring */}
          <div
            style={{
              position: "absolute",
              inset: -12,
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, #4c0099, #a855f7, #1a0535, #7c3aed, #ddd6fe, #3b0082, #4c0099)",
              animation: "ringSpin 10s linear infinite",
              filter: "blur(16px)",
              opacity: 0.5,
            }}
          />
          {/* Counter-rotating inner glow */}
          <div
            style={{
              position: "absolute",
              inset: -5,
              borderRadius: "50%",
              background:
                "conic-gradient(from 200deg, #6d28d9, #0a0015, #c4b5fd, #3b0082, #7c3aed, #6d28d9)",
              animation: "ringSpinR 15s linear infinite",
              filter: "blur(6px)",
              opacity: 0.38,
            }}
          />
          {/* Crisp visible border ring */}
          <div
            style={{
              position: "absolute",
              inset: -3,
              borderRadius: "50%",
              background:
                "conic-gradient(from 0deg, #5b21b6 0%, #a855f7 28%, #ede9fe 50%, #7c3aed 72%, #5b21b6 100%)",
              animation: "ringSpin 10s linear infinite",
            }}
          />
          {/* Dark gap to isolate ring from avatar */}
          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              background: "#07050f",
            }}
          />
          {/* Avatar interior */}
          <div
            style={{
              position: "absolute",
              inset: 3,
              borderRadius: "50%",
              background:
                "radial-gradient(circle at 42% 34%, #231042 0%, #130828 50%, #07050f 100%)",
              animation: "avatarGlow 8s ease-in-out infinite",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              overflow: "hidden",
            }}
          >
            {/* Silhouette placeholder — Robin's tall, slender shape */}
            <svg viewBox="0 0 100 100" width="66" height="66" opacity={0.25}>
              <circle cx="50" cy="32" r="17" fill="#c4b5fd" />
              <ellipse cx="50" cy="80" rx="22" ry="16" fill="#c4b5fd" />
              <rect x="43" y="48" width="14" height="28" rx="7" fill="#c4b5fd" />
            </svg>
          </div>
        </div>

        {/* ── Arms overlay — perfectly centered over the profile circle ── */}
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: CIRCLE_D,
            height: CIRCLE_D,
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          {arms.map(({ angle, delay, armScale }) => (
            <div
              key={angle}
              style={{
                position: "absolute",
                inset: 0,
                // Rotate the container so "top center" aligns with the desired clock position
                transform: `rotate(${angle}deg)`,
              }}
            >
              {/* Anchor at top center of this rotated container = circle edge */}
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: "50%",
                  // Pull the group upward so its bottom edge sits at the circle edge
                  transform: "translateX(-50%) translateY(-100%)",
                  transformOrigin: "50% 100%",
                }}
              >
                {/* Animated inner wrapper — scale from bottom (flower) outward */}
                <div
                  style={{
                    animation: `fleurCycle ${CYCLE}s ${delay}s ease-in-out infinite`,
                    transformOrigin: "50% 100%",
                  }}
                >
                  <ArmHand armScale={armScale} />
                  <FlowerPortal scale={armScale} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
