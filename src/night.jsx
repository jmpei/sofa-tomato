// Movie Night (the slot machine), People, the "tonight" pop-up and the
// first-visit tutorial.
import {
  infoLine, nightPool, connection, cleanTitle, validateTag, CLAUDE_ID, RELATIONS, DEFAULT_RELATION,
} from "./core.js";
import { SlotMachine, ClaudeMascot } from "./slot.jsx";

const { useState, useEffect, useRef, useId } = React;

// A <dialog> that opens while `open` is true. Escape calls onClose.
function Modal({ open, className, labelledBy, onClose, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog ref={ref} className={className} aria-labelledby={labelledBy} onCancel={(e) => { e.preventDefault(); onClose(); }}>
      {open && children}
    </dialog>
  );
}

// ---------- Movie Night ----------

function PickDetails({ movie }) {
  return (
    <>
      <p className="night-title">{movie.title}</p>
      {infoLine(movie.info) && <p className="row-meta">{infoLine(movie.info)}</p>}
      {movie.info?.plot && <p className="night-plot">{movie.info.plot}</p>}
    </>
  );
}

// Two steps, so one tap can't throw the night away.
function EndButton({ onEnd, alone }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) {
    return <button type="button" className="link-button" onClick={() => setConfirming(true)}>End Movie Night</button>;
  }
  return (
    <div className="confirm-row" role="group" aria-label="Confirm end Movie Night">
      <span className="confirm-text">{alone ? "End Movie Night?" : "End Movie Night for both of you?"}</span>
      <button type="button" className="btn btn-danger btn-compact" onClick={onEnd} autoFocus>End it</button>
      <button type="button" className="btn btn-secondary btn-compact" onClick={() => setConfirming(false)}>Keep going</button>
    </div>
  );
}

// A partner needs you: they pressed, a pick waits for your answer, or tonight is settled.
export function needsYou(night, me) {
  return night.status === "ready" || (night.status === "voting" && night.voterId === me) || (night.status === "chosen" && !night.seen);
}

function NightPanel({ me, partner, night, logs, nameOf, actions, onLogTonight }) {
  const [busy, setBusy] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const isClaude = partner === CLAUDE_ID;
  const name = nameOf(partner);
  const ownerOf = (uid) => (uid === me ? "your" : `${nameOf(uid)}’s`);
  // Busy until our own write comes back, so a double tap can't pass twice.
  const act = (fn) => async () => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };
  const locked = busy || spinning;

  const myPool = nightPool(logs[me] ?? [], Infinity);
  const theirPool = nightPool(logs[partner] ?? [], Infinity);
  const titles = [...myPool.watchlist, ...myPool.loved, ...theirPool.watchlist, ...theirPool.loved].map((m) => m.title);
  const shown = night.chosen?.title ?? night.pick?.title ?? "";
  const slotState = { voting: "waiting", chosen: "match", empty: "empty" }[night.status] ?? "idle";
  const spinKey = night.key && shown ? `${night.key}:${night.passed.length}:${slotState}` : null;
  const voterName = night.voterId === me ? "you" : name;
  const label =
    slotState === "match" ? `Match: ${shown}, ${shown}, ${shown}.`
      : slotState === "waiting" ? `${shown}, ${shown}, and the third reel waits for ${voterName}.`
      : "The reels are empty.";

  let controls;
  if (spinning) {
    controls = <p className="night-status">Claude pulled the lever…</p>;
  } else if (night.status === "voting") {
    const { pick } = night;
    controls = (
      <>
        <p className="eyebrow">From {ownerOf(pick.ownerId)} {pick.loved ? "loved movies" : "watchlist"}</p>
        <PickDetails movie={pick} />
        {night.voterId === me ? (
          <>
            <p className="night-question">Want to watch it tonight?</p>
            <div className="action-row" role="group" aria-label={`Your answer for ${pick.title}`}>
              <button type="button" className="btn btn-primary" disabled={locked} onClick={act(() => actions.answer("want"))}>Want to watch</button>
              <button type="button" className="btn btn-secondary" disabled={locked} onClick={act(() => actions.answer("either"))}>Either way</button>
              <button type="button" className="btn btn-secondary" disabled={locked} onClick={act(actions.pass)}>Not tonight</button>
            </div>
          </>
        ) : (
          <p className="night-status">{name} is deciding.</p>
        )}
        <EndButton onEnd={actions.end} />
      </>
    );
  } else if (night.status === "chosen") {
    const { chosen } = night;
    const why =
      chosen.how === "both" ? "It’s on both your watchlists, so no vote needed."
        : isClaude ? "Claude likes every movie, so it’s a match."
        : `${chosen.ownerId === me ? name : "You"} said ${chosen.how === "want" ? "want to watch" : "either way"}.`;
    controls = (
      <>
        <p className="eyebrow">Tonight’s movie</p>
        <PickDetails movie={chosen} />
        <p className="night-status">{why}</p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" onClick={onLogTonight}>Watched it? Tag it</button>
          {isClaude && <button type="button" className="btn btn-secondary" disabled={locked} onClick={act(actions.startOver)}>Spin again</button>}
        </div>
        <EndButton onEnd={actions.end} alone={isClaude} />
      </>
    );
  } else if (night.status === "empty") {
    controls = (
      <>
        <p className="night-title">Nothing left to pick.</p>
        <p className="night-status">
          {night.passed.length > 0
            ? "You passed on everything in your watchlists and loved movies."
            : isClaude
              ? "Your watchlist is empty and nothing is starred yet. Add a few movies first."
              : "Neither of you has anything on a watchlist or starred yet. Add a few movies first."}
        </p>
        <div className="action-row">
          <button type="button" className="btn btn-primary" disabled={locked} onClick={act(actions.startOver)}>Start over</button>
        </div>
        <EndButton onEnd={actions.end} alone={isClaude} />
      </>
    );
  } else {
    controls = (
      <>
        <p className="night-pool">
          You: {myPool.watchlist.length} to watch · {myPool.loved.length} loved
          <br />
          {isClaude ? "Claude: likes every movie" : `${name}: ${theirPool.watchlist.length} to watch · ${theirPool.loved.length} loved`}
        </p>
        {night.status === "waiting" ? (
          <>
            <button type="button" className="night-button" disabled>Waiting for {name}…</button>
            <p className="night-status">Ask {name} to press What to watch tonight? too.</p>
            <button type="button" className="link-button" onClick={actions.cancel}>Cancel</button>
          </>
        ) : (
          <>
            {night.status === "ready" && <p className="night-ready">{name} is ready. Your turn.</p>}
            <button type="button" className="night-button" disabled={night.status === "loading" || locked} onClick={act(actions.press)}>
              {night.status === "loading" ? "Loading…" : "What to watch tonight?"}
            </button>
          </>
        )}
      </>
    );
  }

  return (
    <div className="night-stage">
      <SlotMachine titles={titles} pick={shown} state={slotState} spinKey={spinKey} label={label} onSpinningChange={setSpinning} />
      <div className="night-card" aria-live="polite">{controls}</div>
    </div>
  );
}

export function NightView({ me, partners, nights, logs, nameOf, makeActions, onLogTonight, onAddSomeone }) {
  const [picked, setPicked] = useState(null);
  const partner = partners.includes(picked) ? picked : partners[0];
  return (
    <section className="view" aria-labelledby="night-heading">
      <div className="view-inner">
        <div className="block block-lilac">
          <div className="night-head">
            <h1 id="night-heading" className="block-title" tabIndex={-1}>Movie Night</h1>
            <div className="tabs" role="group" aria-label="Movie Night with">
              {partners.map((id) => (
                <button key={id} type="button" className="tab" aria-pressed={id === partner} onClick={() => setPicked(id)}>
                  {nameOf(id)}
                  {id !== partner && needsYou(nights[id], me) && <span className="badge" aria-label="needs you" />}
                </button>
              ))}
              <button type="button" className="tab tab-add" onClick={onAddSomeone}>+ Add someone</button>
            </div>
          </div>
          <NightPanel
            key={partner}
            me={me}
            partner={partner}
            night={nights[partner]}
            logs={logs}
            nameOf={nameOf}
            actions={makeActions(partner)}
            onLogTonight={() => onLogTonight(partner)}
          />
        </div>
      </div>
    </section>
  );
}

export function NightDialog({ night, partnerName, onClose }) {
  const headingId = useId();
  const chosen = night?.chosen;
  return (
    <Modal open={Boolean(chosen)} className="popup" labelledBy={headingId} onClose={onClose}>
      <div className="popup-body">
        <p className="eyebrow">Match · Match · Match</p>
        <h2 id={headingId} className="popup-heading">Tonight you’re watching</h2>
        <p className="popup-title">{chosen?.title}</p>
        {infoLine(chosen?.info) && <p className="popup-meta">{infoLine(chosen.info)}</p>}
        <p className="popup-meta">with {partnerName}</p>
        <button type="button" className="btn btn-inverse" onClick={onClose} autoFocus>OK</button>
      </div>
    </Modal>
  );
}

// ---------- People ----------

// Friends, Family, or a group the person names.
function RelationPicker({ name, value, groups, onChange }) {
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState(null);
  const selectId = useId();
  const inputId = useId();
  const options = [...new Set([...RELATIONS, ...groups, value])];
  if (naming) {
    const save = () => {
      const problem = validateTag(draft);
      if (problem) {
        setError(problem.replace("tag", "group name").replace("tags", "group names"));
        return;
      }
      onChange(cleanTitle(draft));
      setNaming(false);
      setDraft("");
      setError(null);
    };
    return (
      <div className="relation-new">
        <label htmlFor={inputId} className="visually-hidden">New group for {name}</label>
        <input
          id={inputId}
          className="text-input relation-input"
          placeholder="Group name, like Book club"
          maxLength={60}
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setNaming(false);
          }}
        />
        <button type="button" className="btn btn-primary btn-compact" onClick={save}>Save</button>
        <button type="button" className="link-button" onClick={() => setNaming(false)}>Cancel</button>
        {error && <p className="field-error" role="alert">{error}</p>}
      </div>
    );
  }
  return (
    <>
      <label htmlFor={selectId} className="visually-hidden">Group for {name}</label>
      <select
        id={selectId}
        className="select select-compact"
        value={value}
        onChange={(e) => (e.target.value === "\u0000new" ? setNaming(true) : onChange(e.target.value))}
      >
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
        <option value={"\u0000new"}>New group…</option>
      </select>
    </>
  );
}

function PersonRow({ id, status, relation, groups, nameOf, stats, actions }) {
  const [confirming, setConfirming] = useState(false);
  const name = nameOf(id);
  const isClaude = id === CLAUDE_ID;
  useEffect(() => setConfirming(false), [status]);
  const meta = isClaude ? "Likes every movie"
    : {
      connected: `${stats.watched} watched · ${stats.watchlist} on watchlist`,
      sent: "Request sent",
      received: "Wants to connect with you",
      declined: "Not connected",
      none: "Has opened this page",
    }[status];
  return (
    <li className="person">
      <div className="person-who">
        {isClaude && <ClaudeMascot />}
        <div className="person-text">
          <span className="person-name">{name}</span>
          <span className="person-meta">{meta}</span>
        </div>
      </div>
      <div className="person-actions">
        {status === "connected" && (
          <RelationPicker name={name} value={relation} groups={groups} onChange={(r) => actions.setRelation(id, r)} />
        )}
        {status === "none" && <button type="button" className="btn btn-primary btn-compact" onClick={() => actions.request(id)}>Connect</button>}
        {(status === "sent" || status === "declined") && (
          <button type="button" className="link-button" onClick={() => actions.withdraw(id)}>
            {status === "sent" ? "Cancel request" : "Remove"}
          </button>
        )}
        {status === "received" && (
          <>
            <button type="button" className="btn btn-primary btn-compact" onClick={() => actions.request(id)}>Accept</button>
            <button type="button" className="link-button" onClick={() => actions.decline(id)}>Decline</button>
          </>
        )}
        {status === "connected" && !isClaude && !confirming && (
          <button type="button" className="link-button" onClick={() => setConfirming(true)}>Disconnect</button>
        )}
        {status === "connected" && !isClaude && confirming && (
          <>
            <button type="button" className="btn btn-danger btn-compact" onClick={() => actions.decline(id)} autoFocus>Disconnect {name}</button>
            <button type="button" className="link-button" onClick={() => setConfirming(false)}>Keep</button>
          </>
        )}
      </div>
    </li>
  );
}

export function PeopleView({ mode, people, links, logs, nameOf, actions }) {
  const statusOf = (id) => (id === CLAUDE_ID ? "connected" : connection(links.mine[id], links.theirs[id]));
  const relationOf = (id) => links.mine[id]?.relation ?? DEFAULT_RELATION;
  const connected = [CLAUDE_ID, ...people.filter((id) => statusOf(id) === "connected")];
  const others = people.filter((id) => statusOf(id) !== "connected");
  const groups = [...new Set(connected.map(relationOf))].sort(
    (a, b) => (RELATIONS.indexOf(a) + 1 || 99) - (RELATIONS.indexOf(b) + 1 || 99) || a.localeCompare(b)
  );
  const row = (id) => {
    const theirs = logs[id] ?? [];
    return (
      <PersonRow
        key={id}
        id={id}
        status={statusOf(id)}
        relation={relationOf(id)}
        groups={groups}
        nameOf={nameOf}
        stats={{ watched: theirs.filter((m) => m.status === "watched").length, watchlist: theirs.filter((m) => m.status === "watchlist").length }}
        actions={actions}
      />
    );
  };
  return (
    <section className="view" aria-labelledby="people-heading">
      <div className="view-inner">
        <div className="block block-cream">
          <h1 id="people-heading" className="block-title" tabIndex={-1}>People</h1>
          {groups.map((g) => (
            <div key={g} className="people-group">
              <h2 className="eyebrow">{g}</h2>
              <ul className="people-list" aria-label={g}>{connected.filter((id) => relationOf(id) === g).map(row)}</ul>
            </div>
          ))}
          {others.length > 0 && (
            <div className="people-group">
              <h2 className="eyebrow">Others on this page</h2>
              <ul className="people-list" aria-label="Others on this page">{others.map(row)}</ul>
            </div>
          )}
          {connected.length === 1 && others.length === 0 && (
            <div className="people-empty">
              <p className="block-title-sm">No one else is here yet.</p>
              <p className="block-copy">
                {mode === "solo"
                  ? "Open this page in Claude and share it to watch with friends and family."
                  : <>To watch with someone, tap <strong>Share</strong> at the top of Claude and send them this page. Once they open it, they’ll show up here.</>}
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ---------- Tutorial ----------

export function Tutorial({ open, onClose }) {
  const headingId = useId();
  return (
    <Modal open={open} className="popup popup-light" labelledBy={headingId} onClose={onClose}>
      <div className="popup-body tutorial">
        <p className="eyebrow">How it works</p>
        {/* Focus starts on the heading, so a short screen opens at the top. */}
        <h2 id={headingId} className="popup-heading" tabIndex={-1} autoFocus>Sofa Tomato in four steps</h2>
        <ol className="steps">
          <li><strong>Just watched something?</strong> Type the title, pick a few words for how it felt, then Mark as watched.</li>
          <li><strong>Want to see it later?</strong> Type the title and Add to watchlist.</li>
          <li><strong>★ Loved it</strong> marks the ones you’d happily watch again.</li>
          <li><strong>Movie Night:</strong> press What to watch tonight? Claude pulls the lever. Play with Claude right away, or connect friends and family under People.</li>
        </ol>
        <button type="button" className="btn btn-primary" onClick={onClose}>OK, I got it</button>
      </div>
    </Modal>
  );
}
