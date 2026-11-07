import { useState, type ChangeEvent } from "react";
import { checkBatch, MAX_UPLOAD_FILES } from "../engine/adapters/detect";
import type { SourceDocument } from "../engine/types";
import { KIND_LABEL, KIND_ORDER, KindGlyph } from "./icons";

export interface UploadOutcome {
  name: string;
  ok: boolean;
  detail: string;
}

export function SourcesPanel({
  documents,
  onUpload,
}: {
  documents: SourceDocument[];
  onUpload: (files: File[]) => Promise<UploadOutcome[]>;
}) {
  const [outcomes, setOutcomes] = useState<UploadOutcome[]>([]);
  const [batchError, setBatchError] = useState<string | null>(null);

  const change = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    const err = checkBatch(files.length);
    setBatchError(err);
    if (err || !files.length) return;
    setOutcomes(await onUpload(files));
  };

  return (
    <section aria-labelledby="src-h" className="panel">
      <h2 id="src-h">Body parts</h2>
      <p className="lede">
        The four disconnected tools this creature is stitched from. You only see the parts your persona may open; restricted parts are not listed, counted or hinted at.
      </p>
      <div className="kinds">
        {KIND_ORDER.map((k) => {
          const docs = documents.filter((d) => d.kind === k);
          return (
            <div key={k} className={`kind-col kind-${k}`}>
              <h3>
                <KindGlyph kind={k} /> {KIND_LABEL[k]} <span className="count">{docs.length}</span>
              </h3>
              <ul>
                {docs.map((d) => (
                  <li key={d.id} className={`doc ${d.status !== "active" ? "doc-ghost" : ""}`}>
                    <strong>{d.title}</strong>
                    <span className="doc-meta">
                      v{d.version} · {d.updatedAt.slice(0, 10)} · {d.passages.length} passage{d.passages.length === 1 ? "" : "s"}
                      {d.status !== "active" && ` · ${d.status}`}
                    </span>
                    <span className="groups">
                      {[...d.acl.groups, ...d.acl.users.map((u) => `@${u}`)].map((g) => (
                        <span key={g} className="group">
                          {g}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="upload">
        <h3>Stitch in your own part</h3>
        <p>
          Up to {MAX_UPLOAD_FILES} files, 512 KB each: Markdown or text (wiki), CSV (sheet), or JSON ticket or chat exports. Files stay in this browser tab and are visible to everyone in the session.
        </p>
        <label className="file">
          <input type="file" multiple accept=".md,.markdown,.txt,.csv,.json" onChange={change} />
          <span>Choose files</span>
        </label>
        {batchError && <p className="notice warn">{batchError}</p>}
        {outcomes.length > 0 && (
          <ul className="outcomes">
            {outcomes.map((o) => (
              <li key={o.name} className={o.ok ? "ok" : "bad"}>
                <strong>{o.name}</strong>: {o.detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
