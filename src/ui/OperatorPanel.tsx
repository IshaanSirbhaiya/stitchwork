import { useState } from "react";
import type { Acl, SourceDocument } from "../engine/types";

export function OperatorPanel({
  documents,
  liveAcl,
  onChange,
  onSealShut,
  onReset,
  sealArmed,
  walnutAttached = false,
  forgeArmed = false,
  onForge,
}: {
  documents: SourceDocument[];
  liveAcl: (docId: string) => Acl | undefined;
  onChange: (docId: string, group: string, action: "revoke" | "restore") => Promise<boolean>;
  onSealShut: () => void;
  onReset: () => void;
  sealArmed: boolean;
  walnutAttached?: boolean;
  forgeArmed?: boolean;
  onForge?: () => void;
}) {
  const [docId, setDocId] = useState("pricing-guidelines");
  const [group, setGroup] = useState("sales");
  const [note, setNote] = useState<string | null>(null);
  const doc = documents.find((d) => d.id === docId);
  const live = liveAcl(docId);
  const groups = [...new Set([...(doc?.acl.groups ?? []), ...(live?.groups ?? [])])];

  const act = async (action: "revoke" | "restore") => {
    const ok = await onChange(docId, group, action);
    setNote(
      ok
        ? `${action === "revoke" ? "Revoked" : "Restored"} "${group}" on ${doc?.title} at the source. The index was not rebuilt; Gate 2 enforces it on the next question.`
        : `Nothing changed: "${group}" is ${action === "revoke" ? "not on" : "already on"} the live ACL.`,
    );
  };

  return (
    <details className="operator">
      <summary>Demo operator controls (not part of any user's view)</summary>
      <p className="fine">These simulate changes in the source systems so the governance behaviour can be shown live. They see every document by design.</p>
      <div className="op-grid">
        <label>
          Document
          <select value={docId} onChange={(e) => setDocId(e.target.value)}>
            {documents.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title} ({d.id})
              </option>
            ))}
          </select>
        </label>
        <label>
          Group
          <select value={group} onChange={(e) => setGroup(e.target.value)}>
            {[...new Set([...groups, "everyone", "staff", "sales", "claims", "hr", "fincrime", "compliance", "contractors"])].map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
        <div className="op-actions">
          <button type="button" onClick={() => act("revoke")}>
            Revoke at source
          </button>
          <button type="button" onClick={() => act("restore")}>
            Restore at source
          </button>
        </div>
      </div>
      <p className="fine">
        Index ACL: {doc ? [...doc.acl.groups, ...doc.acl.users.map((u) => `@${u}`)].join(", ") || "none" : "?"} · Live ACL:{" "}
        {live ? [...live.groups, ...live.users.map((u) => `@${u}`)].join(", ") || "none" : "missing (denied)"}
      </p>
      {note && <p className="notice">{note}</p>}
      <div className="op-actions">
        <button type="button" className={sealArmed ? "armed" : ""} onClick={onSealShut}>
          {sealArmed ? "Crypt will fail on the next write" : "Seal the Crypt shut for the next write"}
        </button>
        {walnutAttached && onForge && (
          <button type="button" className={forgeArmed ? "armed" : ""} onClick={onForge} title="Adds a sentence no source supports to the next answer, as a hallucinating model might">
            {forgeArmed ? "A forged stitch will be sewn into the next answer" : "Forge a stitch in the next answer"}
          </button>
        )}
        <button type="button" onClick={onReset}>
          Reset session
        </button>
      </div>
    </details>
  );
}
