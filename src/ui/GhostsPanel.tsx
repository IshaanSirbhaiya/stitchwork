import type { GhostNote } from "../engine/types";

export function GhostsPanel({
  ghosts,
  isSteward,
  onExorcise,
  message,
}: {
  ghosts: GhostNote[];
  isSteward: boolean;
  onExorcise: (docId: string) => void;
  message: string | null;
}) {
  return (
    <section aria-labelledby="ghost-h" className="panel">
      <h2 id="ghost-h">Ghosts</h2>
      <p className="lede">
        Superseded versions that still haunt the archive. They are kept out of every answer. Ghosts are judged only among documents you can open, so a newer version you cannot see is never revealed.
      </p>
      {message && <p className="notice">{message}</p>}
      {ghosts.length === 0 ? (
        <p className="empty">No ghosts visible to this persona. The archive is at rest.</p>
      ) : (
        <ul className="ghost-list">
          {ghosts.map((g) => (
            <li key={g.docId} className="ghost-card large">
              <span className="ghost-glyph" aria-hidden="true" />
              <div>
                <strong>
                  {g.title} v{g.version}
                </strong>
                <p>
                  {g.reason === "newer-version" && g.livingTitle
                    ? `Replaced by ${g.livingTitle} v${g.livingVersion}.`
                    : "Marked superseded by its owner. No living version is visible to you."}
                </p>
              </div>
              {isSteward ? (
                <button type="button" className="ghost-btn" onClick={() => onExorcise(g.docId)}>
                  Exorcise
                </button>
              ) : (
                <span className="fine">Only a data steward can exorcise</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
