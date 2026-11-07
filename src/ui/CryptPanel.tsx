import { useMemo, useState } from "react";
import type { CryptEntry, VerifyResult } from "../engine/ledger";
import type { WalnutStitches } from "../walnut/stitches";

function matches(e: CryptEntry, words: string[]): boolean {
  const hay = `${e.type} ${JSON.stringify(e.data)}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

function describe(r: VerifyResult): string {
  return r.ok
    ? `Verified: all ${r.count} entries chain and seal correctly.`
    : `Broken at entry ${r.brokenAt} of ${r.count}: ${r.reason}.`;
}

function WalnutCryptTools({ walnut }: { walnut: WalnutStitches }) {
  const [out, setOut] = useState<{ tone: "ok" | "fail" | "info"; lines: string[] } | null>(null);
  const run = async (f: () => Promise<{ tone: "ok" | "fail" | "info"; lines: string[] }>) => {
    try {
      setOut(await f());
    } catch {
      setOut({ tone: "fail", lines: ["The Walnut stitches did not answer. Nothing can be released until they do."] });
    }
  };
  return (
    <div className="walnut-crypt" data-testid="walnut-crypt">
      <h3>The durable Crypt (Walnut sealed ledger)</h3>
      <p className="fine">
        Every entry above is also sealed into Walnut's append-only decision ledger on disk: a SHA-256 hash chain, an HMAC seal and a separate anchor ledger, so edits, deletions and rollbacks are all detected.
      </p>
      <div className="crypt-tools">
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const v = await walnut.verify();
              return v.ok
                ? { tone: "ok", lines: [`Walnut verified: all ${v.count} sealed entries chain, seal and match their anchor. Head ${(v.head ?? "").slice(0, 16)}...`] }
                : { tone: "fail", lines: [`Walnut refuses this Crypt: ${v.why}`] };
            })
          }
        >
          Verify Walnut Crypt
        </button>
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const t = await walnut.tamperDemo();
              if (!t.attacks.length) return { tone: "info", lines: [t.note ?? "The Crypt is empty."] };
              return {
                tone: "info",
                lines: [
                  ...t.attacks.map((a) => `${a.attack}: ${a.detected ? "detected" : "NOT detected"} (${(a.why.match(/\((.*)\):/)?.[1] ?? a.why) || "verifies"})`),
                  t.untouched ? "Attacks ran on copies. The real Walnut Crypt is byte for byte unchanged." : "Warning: the real Crypt changed.",
                ],
              };
            })
          }
        >
          Walnut tamper demo
        </button>
      </div>
      {out && (
        <ul className={`notice ${out.tone} walnut-out`} data-testid="walnut-crypt-out">
          {out.lines.map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CryptPanel({
  isSteward,
  entries,
  onVerify,
  onTamper,
  walnut = null,
}: {
  isSteward: boolean;
  entries: CryptEntry[];
  onVerify: () => Promise<VerifyResult>;
  onTamper: () => Promise<{ index: number; result: VerifyResult } | null>;
  walnut?: WalnutStitches | null;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ tone: "ok" | "fail" | "info"; text: string } | null>(null);
  const shown = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return [...entries].reverse().filter((e) => matches(e, words));
  }, [entries, query]);

  if (!isSteward) {
    return (
      <section aria-labelledby="crypt-h" className="panel">
        <h2 id="crypt-h">The Crypt</h2>
        <div className="sealed" data-testid="crypt-sealed">
          <p>The Crypt is sealed. Only a data steward can read it.</p>
          <p className="fine">Switch to Iris Vane (Compliance Officer and Data Steward) to open it.</p>
        </div>
      </section>
    );
  }

  return (
    <section aria-labelledby="crypt-h" className="panel">
      <h2 id="crypt-h">The Crypt</h2>
      <p className="lede">
        Every question writes three entries before anything is released. Each entry carries the hash of the one before it and a seal made with this session's key, so any quiet edit breaks the chain.
      </p>
      <div className="crypt-tools">
        <label htmlFor="crypt-q" className="sr-only">
          Search the Crypt
        </label>
        <input id="crypt-q" placeholder="Search, for example: theo gravewell" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button
          type="button"
          onClick={async () => {
            const r = await onVerify();
            setStatus({ tone: r.ok ? "ok" : "fail", text: describe(r) });
          }}
        >
          Verify chain
        </button>
        <button
          type="button"
          onClick={async () => {
            const r = await onTamper();
            setStatus(
              r
                ? { tone: "info", text: `Tamper demo: edited entry ${r.index} in a copy. ${describe(r.result)} The real Crypt is untouched.` }
                : { tone: "info", text: "The Crypt is empty. Ask a question first." },
            );
          }}
        >
          Tamper demo
        </button>
      </div>
      {status && <p className={`notice ${status.tone}`}>{status.text}</p>}
      {walnut && <WalnutCryptTools walnut={walnut} />}
      {shown.length === 0 ? (
        <p className="empty">{entries.length ? "No entries match." : "The Crypt is empty. Ask a question first."}</p>
      ) : (
        <ol className="crypt" reversed>
          {shown.map((e) => (
            <li key={e.seq}>
              <div className="crypt-row">
                <span className="seq">#{e.seq}</span>
                <span className={`type t-${e.type.replace(".", "-")}`}>{e.type}</span>
                <span className="at">{e.at.slice(11, 19)}</span>
                {typeof (e.data.userId ?? e.data.by) === "string" && <span className="who-tag">@{String(e.data.userId ?? e.data.by)}</span>}
                <code className="hash" title={e.hash}>
                  {e.hash.slice(0, 12)}
                </code>
              </div>
              <details>
                <summary>data</summary>
                <pre>{JSON.stringify(e.data, null, 2)}</pre>
                <p className="fine">
                  prev {e.prevHash.slice(0, 16)}... · seal {e.seal.slice(0, 16)}...
                </p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
