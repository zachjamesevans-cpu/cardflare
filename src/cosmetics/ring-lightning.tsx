/**
 * Lightning: the founder's Figma export, as a profile border.
 *
 * His file, converted by `npm run cosmetics:svg` into
 * public/cosmetics/ring-lightning.svg, which is what actually ships.
 * tests/unit/figma-tsx.test.ts regenerates it and fails if the two
 * drift, so editing this file without rebuilding cannot go unnoticed.
 *
 * Three things from the Figma frame were removed, and only these: the
 * page background circle, the filled profile disc, and the placeholder
 * person. A cosmetic's middle has to be transparent - a real face goes
 * there. Everything else, including all 88 sparks and every keyframe,
 * is exactly as it was exported.
 *
 * The geometry is the convention for a profile border: a 400x400 box
 * with the ring at radius 152, so the avatar fills the middle 76%.
 */
const CX = 200,
  CY = 200,
  RING_R = 152;

function sr(n: number) {
  return Math.abs(Math.sin(n * 127.1 + 311.7) * 43758.5453) % 1;
}

function f(n: number) {
  return n.toFixed(1);
}

const COLORS = ["#ffffff", "#ffcccc", "#ff6666", "#ff1a1a", "#cc0000"];
const ANIMS = ["lf-a", "lf-b", "lf-c", "lf-d", "lf-e"];

const sparks = Array.from({ length: 88 }, (_, i) => {
  const angle = (Math.PI * 2 * i) / 88 + (sr(i) - 0.5) * 0.14;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const px = -sin,
    py = cos;

  const len = 6 + sr(i * 2 + 1) * 54;
  const hasKink = sr(i * 3 + 2) > 0.18;
  const t = 0.25 + sr(i * 4 + 3) * 0.5;
  const jag = (sr(i * 5 + 4) - 0.5) * len * 0.52;

  const x0 = CX + RING_R * cos;
  const y0 = CY + RING_R * sin;
  const x1 = CX + (RING_R + len) * cos;
  const y1 = CY + (RING_R + len) * sin;
  const xm = CX + (RING_R + len * t) * cos + jag * px;
  const ym = CY + (RING_R + len * t) * sin + jag * py;

  const hasKink2 = hasKink && sr(i * 6 + 5) > 0.55;
  const t2 = t + 0.2 + sr(i * 7 + 6) * 0.2;
  const jag2 = (sr(i * 8 + 7) - 0.5) * len * 0.3;
  const xm2 = CX + (RING_R + len * Math.min(t2, 0.95)) * cos + jag2 * px;
  const ym2 = CY + (RING_R + len * Math.min(t2, 0.95)) * sin + jag2 * py;

  let d: string;
  if (!hasKink) {
    d = `M${f(x0)},${f(y0)}L${f(x1)},${f(y1)}`;
  } else if (!hasKink2) {
    d = `M${f(x0)},${f(y0)}L${f(xm)},${f(ym)}L${f(x1)},${f(y1)}`;
  } else {
    d = `M${f(x0)},${f(y0)}L${f(xm)},${f(ym)}L${f(xm2)},${f(ym2)}L${f(x1)},${f(y1)}`;
  }

  return {
    d,
    color: COLORS[Math.floor(sr(i * 9 + 8) * COLORS.length)],
    sw: 0.4 + sr(i * 10 + 9) * 2.2,
    op: 0.2 + sr(i * 11 + 10) * 0.8,
    delay: `${(sr(i * 12 + 11) * 2.8).toFixed(2)}s`,
    dur: `${(0.15 + sr(i * 13 + 12) * 1.5).toFixed(2)}s`,
    anim: ANIMS[i % 5],
  };
});

export default function App() {
  return (
    <div className="flex size-full items-center justify-center">
      <style>{`
        @keyframes lf-a {
          0%,100%{opacity:1}
          46%{opacity:.07}
          54%{opacity:1}
        }
        @keyframes lf-b {
          0%,100%{opacity:.75}
          18%{opacity:.04}
          19%{opacity:1}
          62%{opacity:.45}
          80%{opacity:.9}
        }
        @keyframes lf-c {
          0%,100%{opacity:.9}
          33%{opacity:.25}
          34%{opacity:1}
          68%{opacity:.65}
        }
        @keyframes lf-d {
          0%,100%{opacity:1}
          12%{opacity:.55}
          28%{opacity:.02}
          29%{opacity:.95}
          78%{opacity:.7}
        }
        @keyframes lf-e {
          0%,100%{opacity:.5}
          8%{opacity:1}
          9%{opacity:.15}
          52%{opacity:.85}
          88%{opacity:.4}
        }
        @keyframes ring-breathe {
          0%,100%{opacity:1}
          50%{opacity:.82}
        }
        @keyframes ring-breathe-2 {
          0%,100%{opacity:.92}
          50%{opacity:1}
        }
      `}</style>

      <svg
        width="400"
        height="400"
        viewBox="0 0 400 400"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {/* Ambient outer glow for the ring */}
          <filter id="glow-xl" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="16" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Medium ring glow */}
          <filter id="glow-md" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Subtle spark bloom applied to the whole spark group */}
          <filter id="spark-bloom" x="-15%" y="-15%" width="130%" height="130%">
            <feGaussianBlur stdDeviation="1.8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>

          {/* Profile area gradients */}
          <radialGradient id="page-bg" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0e0e28" />
            <stop offset="100%" stopColor="#04040c" />
          </radialGradient>
          <radialGradient id="profile-fill" cx="50%" cy="42%" r="52%">
            <stop offset="0%" stopColor="#181840" />
            <stop offset="100%" stopColor="#080818" />
          </radialGradient>
        </defs>

        {/* Far ambient halo */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="none"
          stroke="#cc0000"
          strokeWidth={48}
          opacity={0.05}
          filter="url(#glow-xl)"
          style={{ animation: "ring-breathe 4s ease-in-out infinite" }}
        />

        {/* Sparks — all 88, one bloom filter on the group */}
        <g filter="url(#spark-bloom)">
          {sparks.map((s, i) => (
            <path
              key={i}
              d={s.d}
              stroke={s.color}
              strokeWidth={s.sw}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
              style={{
                opacity: s.op,
                animation: `${s.anim} ${s.dur} ${s.delay} infinite`,
              }}
            />
          ))}
        </g>

        {/* Ring — deep amber outer glow */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="none"
          stroke="#8b0000"
          strokeWidth={8}
          opacity={0.45}
          filter="url(#glow-xl)"
          style={{ animation: "ring-breathe 3.8s ease-in-out infinite" }}
        />

        {/* Ring — electric yellow mid-glow */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="none"
          stroke="#ff2222"
          strokeWidth={4}
          opacity={0.65}
          filter="url(#glow-md)"
          style={{ animation: "ring-breathe-2 2.4s ease-in-out 0.35s infinite" }}
        />

        {/* Ring — bright white core */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R}
          fill="none"
          stroke="#ffffff"
          strokeWidth={1.5}
          opacity={0.96}
          style={{ animation: "ring-breathe 1.9s ease-in-out 0.15s infinite" }}
        />

        {/* Ring — inner warm accent line */}
        <circle
          cx={CX}
          cy={CY}
          r={RING_R - 3}
          fill="none"
          stroke="#ff4444"
          strokeWidth={0.75}
          opacity={0.45}
          style={{ animation: "ring-breathe-2 2.8s ease-in-out 0.6s infinite" }}
        />
      </svg>
    </div>
  );
}
