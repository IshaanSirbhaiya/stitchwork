import { useState, type FormEvent } from "react";
import type { AskResponse, Citation, TrailStep, WalnutReport } from "../engine/types";
import type { WalnutPointer } from "../walnut/stitches";
import { MAX_QUERY_CHARS, STITCHES_UNAVAILABLE_MESSAGE } from "../engine/types";
import { SAMPLE_QUESTIONS } from "../data/personas";
import { KindGlyph, KIND_LABEL } from "./icons";
import { StitchMap } from "./StitchMap";

const TRAIL_LABEL: Record<TrailStep["step"], string> = {
  identity: "Identity",
  "crypt-accept": "Crypt write",
  "gate-1": "Gate 1: index ACL",
  "gate-2": "Gate 2: live re-check",
  "ghost-check": "Ghost check",
  stitch: "Stitch",
  "walnut-wall": "Walnut grounding wall",
  "crypt-seal": "Crypt seal",
};

function WalnutBox({ report }: { report: WalnutReport }) {
  const total = report.kept + report.dropped.length;
  return (
    <section className="walnut-box" aria-label="Walnut stitches" data-testid="walnut-report">
      <h3>Walnut stitches</h3>
      <p>
        <strong>Grounding wall:</strong> {report.kept} of {total} sentence{total === 1 ? "" : "s"} kept. Each sentence was checked only against the passages it cites; any value or name not in them is dropped.
      </p>
      {report.dropped.length > 0 && (
        <ul className="walnut-dropped" data-testid="walnut-dropped">
          {report.dropped.map((d, i) => (
            <li key={i}>
              <s>{d.text}</s>
              <span className="fine"> Dropped: {d.reasons.join("; ")}.</span>
            </li>
          ))}
        </ul>
      )}
      <p className="fine">
        Sealed in the durable Walnut Crypt as {report.seals.map((s) => `#${s.seq} ${s.type}`).join(", ")}.
      </p>
    </section>
  );
}

function pointerLine(p: WalnutPointer): string {
  return `Walnut pointer: ${p.kind} chars ${p.char_start} to ${p.char_end} of ${p.document_id}, ${p.trust}`;
}

function time(iso: string): string {
  return iso.slice(11, 19);
}

function CitationCard({ c, open, onToggle, pointer }: { c: Citation; open: boolean; onToggle: () => void; pointer?: WalnutPointer }) {
  return (
    <li className={`cite kind-${c.kind}`} id={`cite-${c.n}`}>
      <button type="button" className="cite-head" aria-expanded={open} onClick={onToggle}>
        <span className="stitch-no" aria-hidden="true">{c.n}</span>
        <KindGlyph kind={c.kind} />
        <span className="cite-title">
          <strong>{c.title}</strong>
          <span className="cite-loc">
            {KIND_LABEL[c.kind]} · {c.location}
          </span>
        </span>
      </button>
      <p className="cite-meta">
        v{c.version} · updated {c.updatedAt.slice(0, 10)} · access re-checked {time(c.checkedAt)} UTC
        {c.dusty && <span className="badge dusty" title="Older than 540 days and never replaced">dusty</span>}
      </p>
      {pointer && (
        <p className={`cite-meta walnut-ptr ${pointer.trust}`} title={`capture sha256 ${pointer.capture_digest}`}>
          {pointerLine(pointer)}
        </p>
      )}
      {open && <blockquote className="cite-text">{c.text}</blockquote>}
    </li>
  );
}

export function AskPanel({
  onAsk,
  response,
  busy,
  personaName,
}: {
  onAsk: (q: string) => void;
  response: AskResponse | null;
  busy: boolean;
  personaName: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<Set<number>>(new Set());

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setOpen(new Set());
    onAsk(q);
  };
  const toggle = (n: number) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });

  return (
    <section aria-labelledby="ask-h" className="panel">
      <h2 id="ask-h">The laboratory</h2>
      <p className="lede">
        Ask as <strong>{personaName}</strong>. Stitchwork searches only what this person may open, re-checks access live, skips ghost versions, and sews the answer from wiki, tickets, chat and sheets.
      </p>
      <form className="ask" onSubmit={submit}>
        <label htmlFor="q" className="sr-only">
          Your question
        </label>
        <input
          id="q"
          value={q}
          maxLength={MAX_QUERY_CHARS + 20}
          onChange={(e) => setQ(e.target.value)}
          placeholder="What is the refund window for cancelled policies?"
          autoComplete="off"
        />
        <button type="submit" className="primary" disabled={busy}>
          {busy ? "Stitching..." : "Reanimate"}
        </button>
      </form>
      <div className="chips" role="group" aria-label="Sample questions">
        {SAMPLE_QUESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            className="chip"
            onClick={() => {
              setQ(s);
              setOpen(new Set());
              onAsk(s);
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <div aria-live="polite" className="result">
        {response?.status === "invalid_query" && <p className="notice warn">{response.message}</p>}
        {response?.status === "ledger_unavailable" && (
          <p className="notice fail" role="alert">
            <strong>{response.message === STITCHES_UNAVAILABLE_MESSAGE ? "The stitches will not hold." : "The Crypt is sealed shut."}</strong> {response.message}
          </p>
        )}
        {response && (response.status === "answered" || response.status === "no_answer") && (
          <>
            {response.status === "answered" ? (
              <article className="answer reanimate" key={response.requestId} data-testid="answer">
                <h3>The answer, stitched</h3>
                <ol className="sentences">
                  {response.sentences.map((s, i) => (
                    <li key={i}>
                      {s.text}{" "}
                      {s.citations.map((n) => (
                        <button key={n} type="button" className="marker" aria-label={`Show source ${n}`} onClick={() => toggle(n)}>
                          {n}
                        </button>
                      ))}
                    </li>
                  ))}
                </ol>
              </article>
            ) : (
              <article className="answer tomb" key={response.requestId} data-testid="no-answer">
                <h3>Nothing to reanimate</h3>
                <p>{response.message}</p>
              </article>
            )}

            {response.ghosts.length > 0 && (
              <ul className="ghost-notes" aria-label="Ghost versions skipped">
                {response.ghosts.map((g) => (
                  <li key={g.docId} className="ghost-card">
                    <span className="ghost-glyph" aria-hidden="true" />
                    <span>
                      <strong>Ghost caught:</strong> {g.title} v{g.version}{" "}
                      {g.livingTitle
                        ? `was skipped in favour of ${g.livingTitle} v${g.livingVersion}.`
                        : "is marked superseded and was kept out of the answer."}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {response.status === "answered" && (
              <>
                <StitchMap sentences={response.sentences} citations={response.citations} />
                <ul className="cites">
                  {response.citations.map((c) => (
                    <CitationCard key={c.n} c={c} open={open.has(c.n)} onToggle={() => toggle(c.n)} pointer={response.walnut?.pointers.find((p) => p.n === c.n)?.pointer} />
                  ))}
                </ul>
              </>
            )}

            {response.walnut && <WalnutBox report={response.walnut} />}

            <ol className="trail" aria-label="Pipeline trail">
              {response.trail.map((t) => (
                <li key={t.step} className={t.ok ? "ok" : "bad"}>
                  {TRAIL_LABEL[t.step]}
                </li>
              ))}
            </ol>
            <p className="fine">
              Request {response.requestId}. Denied passages are never counted here; a data steward can see the decision in the Crypt.
            </p>
          </>
        )}
      </div>
    </section>
  );
}
