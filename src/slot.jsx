// The Movie Night slot machine. Claude (the little orange pixel creature)
// pulls the lever, three reels spin through movie titles and stop on the
// pick. Two reels land on it; the third waits for the other person's yes.
// A yes lands the third reel too: MATCH · MATCH · MATCH.

const { useEffect, useRef, useState } = React;

const SPIN_MS = [1100, 1500, 1900];
const FILLER = 14;

// Claude, drawn on a pixel grid like the original sprite.
export function ClaudeMascot({ pulling = false, cheering = false }) {
  return (
    <svg
      className={`mascot${pulling ? " mascot-pull" : ""}${cheering ? " mascot-cheer" : ""}`}
      viewBox="0 0 18 13"
      role="img"
      aria-label="Claude"
      shapeRendering="crispEdges"
    >
      <rect x="0" y="4" width="2" height="2" className="mascot-body" />
      <rect x="16" y="4" width="2" height="2" className="mascot-body mascot-arm" />
      <rect x="2" y="1" width="14" height="8" className="mascot-body" />
      <rect x="5" y="4" width="1" height="2" className="mascot-eye" />
      <rect x="12" y="4" width="1" height="2" className="mascot-eye" />
      <rect x="3" y="10" width="1" height="3" className="mascot-body" />
      <rect x="5" y="10" width="1" height="3" className="mascot-body" />
      <rect x="12" y="10" width="1" height="3" className="mascot-body" />
      <rect x="14" y="10" width="1" height="3" className="mascot-body" />
    </svg>
  );
}

// A strip of titles that scrolls and stops on `final`. A new `spinKey`
// restarts it; with `still`, it shows `final` at once (no motion).
function Reel({ titles, final, spinKey, duration, still }) {
  const strip = still ? [final] : [...shuffle(titles, spinKey + duration).slice(0, FILLER), final];
  return (
    <div className="reel">
      <ul
        key={`${spinKey}:${final}`}
        className={still ? "reel-strip" : "reel-strip reel-spin"}
        style={still ? undefined : { "--steps": strip.length - 1, animationDuration: `${duration}ms` }}
        aria-hidden="true"
      >
        {strip.map((t, i) => (
          <li key={i} className={t === "?" ? "reel-cell reel-wait" : "reel-cell"}>
            <span>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Same order for the same seed, so a re-render doesn't reshuffle mid-spin.
function shuffle(list, seed) {
  const items = list.length ? list : ["Popcorn", "Tickets", "Sofa", "Remote"];
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  const out = [];
  for (let i = 0; i < FILLER; i += 1) {
    h = Math.imul(h ^ (h >>> 13), 0x5bd1e995);
    out.push(items[(h >>> 0) % items.length]);
  }
  return out;
}

// state: "idle" | "waiting" (pick shown, other person deciding) | "match" | "empty"
// spinKey changes whenever a new pick should spin in.
export const SPIN_TOTAL_MS = SPIN_MS[2] + 100;
export function SlotMachine({ titles, pick, state, spinKey, label, onSpinningChange }) {
  const reduced = useReducedMotion();
  const first = useRef(spinKey);
  // Spin only for picks that arrive while the page is open, not on load.
  const [spinning, setSpinning] = useState(false);
  useEffect(() => {
    if (spinKey === first.current || !spinKey || reduced) return undefined;
    first.current = null;
    setSpinning(true);
    onSpinningChange?.(true);
    const timer = setTimeout(() => {
      setSpinning(false);
      onSpinningChange?.(false);
    }, SPIN_MS[2] + 100);
    return () => {
      clearTimeout(timer);
      onSpinningChange?.(false);
    };
  }, [spinKey, reduced]);

  const show = state === "idle" || state === "empty" ? ["?", "?", "?"] : [pick, pick, state === "match" ? pick : "?"];
  const still = reduced || !spinning;
  return (
    <div className={`slot slot-${state}${spinning ? " slot-spinning" : ""}`}>
      <div className="slot-top">
        <ClaudeMascot pulling={spinning} cheering={state === "match" && !spinning} />
        <p className="slot-marquee" aria-hidden="true">
          {state === "match" && !spinning ? (
            <>
              <span>MATCH</span>
              <span>MATCH</span>
              <span>MATCH</span>
            </>
          ) : (
            <span>{spinning ? "Spinning…" : "Sofa Tomato"}</span>
          )}
        </p>
      </div>
      <div className="slot-body">
        <div className="slot-window" role="img" aria-label={label}>
          {show.map((t, i) => (
            <Reel key={i} titles={titles} final={t} spinKey={spinKey} duration={SPIN_MS[i]} still={still || state === "idle" || state === "empty"} />
          ))}
        </div>
        <div className={`lever${spinning ? " lever-pulled" : ""}`} aria-hidden="true">
          <span className="lever-knob" />
          <span className="lever-stick" />
        </div>
      </div>
    </div>
  );
}

function useReducedMotion() {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => window.matchMedia?.(query).matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return undefined;
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}
