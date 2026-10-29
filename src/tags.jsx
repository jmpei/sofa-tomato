// Tag pickers. Each person's tag list grows as they tag movies; the first
// VISIBLE_TAG_LIMIT tags show, and the rest drop down under "All tags".
import {
  cleanTitle, validateTag, sameTag, toggleTag, pickerTags, splitAtLimit,
} from "./core.js";
import { GhostInput, useGuessers } from "./complete.jsx";

const { useState, useId, useRef } = React;

function Chevron() {
  return (
    <svg className="chevron" viewBox="0 0 12 12" aria-hidden="true">
      <path d="M2.5 4.5L6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// `lead` renders first in the visible row (the ★ Loved it chip). The chips
// sit in their own scroll box, so the All tags button below never scrolls away.
export function FoldedChips({ items, render, lead = null, hiddenSelected = 0 }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const panelRef = useRef(null);
  const { visible, hidden } = splitAtLimit(items);

  function toggle() {
    setOpen(!open);
    // Bring the dropped-down tags into view and move focus to the first one,
    // so the next Tab lands among them.
    if (!open) {
      setTimeout(() => {
        panelRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        panelRef.current?.querySelector("input")?.focus({ preventScroll: true });
      }, 60);
    }
  }

  return (
    <div className="folded">
      <div className="fold-scroll">
        <div className="chips">
          {lead}
          {visible.map(render)}
        </div>
        {hidden.length > 0 && (
          <div id={panelId} ref={panelRef} className="fold-panel" data-open={open ? "true" : "false"}>
            <div className="fold-inner">
              <div className="chips">{hidden.map(render)}</div>
            </div>
          </div>
        )}
      </div>
      {hidden.length > 0 && (
        <button type="button" className="fold-toggle" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
          All tags <span className="filter-count">{hidden.length} more</span>
          {!open && hiddenSelected > 0 && <span className="fold-note">{`· ${hiddenSelected} picked inside`}</span>}
          <Chevron />
        </button>
      )}
    </div>
  );
}

// Pick any number of tags, star the movie, or type a new tag. A typed tag
// that matches an existing one (in any letter case) selects the existing one.
// Typed tags stay in the picker until the form resets (give it a new key).
export function TagChoices({ legend, library, selected, onChange, loved, onLovedChange, hideLegend = false }) {
  const [draft, setDraft] = useState("");
  const [typed, setTyped] = useState([]);
  const [draftError, setDraftError] = useState(null);
  const inputId = useId();
  const errorId = useId();
  const guessers = useGuessers();
  const items = pickerTags(library, [...typed, ...selected]);
  const isSelected = (label) => selected.some((s) => sameTag(s, label));
  const hiddenSelected = splitAtLimit(items).hidden.filter(isSelected).length;

  function addDraft() {
    const error = validateTag(draft);
    if (error) {
      setDraftError(error);
      return;
    }
    const tag = items.find((label) => sameTag(label, draft)) ?? cleanTitle(draft);
    if (!items.some((label) => sameTag(label, tag))) setTyped([tag, ...typed]);
    if (!isSelected(tag)) onChange([...selected, tag]);
    setDraft("");
    setDraftError(null);
  }

  return (
    <fieldset className="chips-fieldset">
      <legend className={hideLegend ? "visually-hidden" : "field-label"}>{legend}</legend>
      <FoldedChips
        items={items}
        hiddenSelected={hiddenSelected}
        lead={
          <label className="chip chip-star">
            <input type="checkbox" checked={loved} onChange={() => onLovedChange(!loved)} />
            <span><span className="star" aria-hidden="true">★</span>Loved it</span>
          </label>
        }
        render={(label) => (
          <label key={label} className="chip">
            <input type="checkbox" checked={isSelected(label)} onChange={() => onChange(toggleTag(selected, label))} />
            <span>{label}</span>
          </label>
        )}
      />
      <div className="tag-add">
        <label htmlFor={inputId} className="visually-hidden">New tag</label>
        <GhostInput
          id={inputId}
          className="tag-input"
          type="text"
          autoComplete="off"
          placeholder="Your own word, like Cozy"
          maxLength={60}
          value={draft}
          candidates={items}
          ask={guessers.tag}
          aria-invalid={draftError ? "true" : "false"}
          aria-describedby={draftError ? errorId : undefined}
          onChange={(next) => {
            setDraft(next);
            if (draftError) setDraftError(null);
          }}
          // Enter adds the tag instead of submitting the whole form.
          onEnter={addDraft}
        />
        <button type="button" className="btn btn-secondary btn-compact" onClick={addDraft}>
          Add tag
        </button>
      </div>
      {draftError && <p id={errorId} className="field-error" role="alert">{draftError}</p>}
    </fieldset>
  );
}
