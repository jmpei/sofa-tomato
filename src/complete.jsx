// Text inputs with a grey inline suggestion: type "Resident" and " Evil"
// shows after the cursor; Tab or Enter takes it. Suggestions come from the
// person's own movies and tags first, then from Claude (when the page can ask).
import { cleanTitle, normalizeTitle, continues, localMatch } from "./core.js";

const { useState, useEffect, useId, useRef, useImperativeHandle, useLayoutEffect, createContext, useContext, forwardRef } = React;

// The Claude guessers for titles and tags ({ title, tag }), or nulls when
// the page can't ask Claude. Provided once by App.
export const GuessContext = createContext({ title: null, tag: null });
export const useGuessers = () => useContext(GuessContext);

const MIN_CHARS = 3;
const ASK_DELAY_MS = 350;

export function titlePrompt(typed) {
  return [
    `Someone is typing a movie title into a movie log. So far they typed: "${typed.slice(0, 100)}"`,
    "Guess the most likely well-known film or series whose title starts with exactly those characters.",
    'Reply with only a JSON object: {"title": "Resident Evil"}. If nothing fits, reply {"title": null}.',
  ].join("\n");
}

export function tagPrompt(typed) {
  return [
    `Someone is typing a short tag (one to three words) for how a movie felt, or what kind of movie it was. So far they typed: "${typed.slice(0, 40)}"`,
    "Guess the most likely tag that starts with exactly those characters, like a genre or a mood.",
    'Reply with only a JSON object: {"tag": "Zombie horror"}. If nothing fits, reply {"tag": null}.',
  ].join("\n");
}

// Asks Claude for a completion, after a pause in typing. Returns null when
// the page can't ask or Claude has nothing. One call at a time; a newer
// keystroke cancels the older call before it is sent.
function useClaudeGuess(typed, ask, enabled) {
  const [guess, setGuess] = useState(null);
  useEffect(() => {
    setGuess(null);
    if (!enabled || !ask || cleanTitle(typed).length < MIN_CHARS) return undefined;
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      ask(typed, ctl.signal)
        .then((s) => !ctl.signal.aborted && setGuess(s))
        .catch(() => {});
    }, ASK_DELAY_MS);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [typed, ask, enabled]);
  return guess;
}

// Wraps sample.json into a guesser for one field. `field` is "title" or "tag".
export function makeGuesser(sample, field) {
  if (!sample) return null;
  const prompt = field === "title" ? titlePrompt : tagPrompt;
  return async (typed, signal) => {
    const reply = await sample.json(prompt(typed), { modelTier: "quick", signal });
    const value = reply && typeof reply[field] === "string" ? cleanTitle(reply[field]).slice(0, 200) : null;
    return value;
  };
}

// An <input> with grey ghost text. `candidates` are local completions in
// priority order; `ask` is a Claude guesser (or null). Enter with no
// suggestion falls through to `onEnter` (or the form).
export const GhostInput = forwardRef(function GhostInput({ value, onChange, candidates, ask, onEnter, className = "", ...inputProps }, ref) {
  const [focused, setFocused] = useState(false);
  // Escape hides the suggestion until the text changes.
  const [dismissed, setDismissed] = useState(null);
  const [overflowing, setOverflowing] = useState(false);
  const inner = useRef(null);
  useImperativeHandle(ref, () => inner.current);
  const hintId = useId();
  const local = localMatch(value, candidates);
  const guess = useClaudeGuess(value, ask, focused && !local);
  const offered = local ?? (continues(value, guess) ? guess : null);
  // A suggestion that would run past the box's edge can't be seen, so it isn't offered.
  const suggestion = offered && dismissed !== value && !overflowing ? offered : null;
  const rest = suggestion ? suggestion.slice(value.length) : "";
  useLayoutEffect(() => {
    const el = inner.current;
    if (el) setOverflowing(el.scrollWidth > el.clientWidth + 1);
  }, [value]);

  function accept() {
    onChange(suggestion);
  }

  return (
    <div className={`ghost-field ${className}`}>
      <span className="ghost-text" aria-hidden="true">
        <span className="ghost-typed">{value}</span>
        {focused && rest}
      </span>
      <input
        {...inputProps}
        ref={inner}
        className="ghost-input"
        value={value}
        aria-describedby={[inputProps["aria-describedby"], suggestion ? hintId : null].filter(Boolean).join(" ") || undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Keys pressed while an input method is composing (pinyin, kana) belong to it.
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Escape" && suggestion) {
            e.preventDefault();
            setDismissed(value);
            return;
          }
          const atEnd = e.currentTarget.selectionStart === value.length;
          if ((e.key === "Tab" || e.key === "Enter") && !e.shiftKey && atEnd && suggestion && normalizeTitle(suggestion) !== normalizeTitle(value)) {
            e.preventDefault();
            accept();
            return;
          }
          if (e.key === "Enter" && onEnter) {
            e.preventDefault();
            onEnter();
          }
        }}
      />
      {suggestion && (
        <span id={hintId} className="visually-hidden">
          Suggestion: {suggestion}. Press Tab to use it, or Escape to ignore it.
        </span>
      )}
    </div>
  );
});
