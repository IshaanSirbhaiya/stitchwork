import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadDataset } from "../data";
import { PERSONAS, personaById } from "../data/personas";
import { detectAndParse } from "../engine/adapters/detect";
import { Engine, STEWARD_GROUP } from "../engine/engine";
import { randomKey } from "../engine/hash";
import { Ledger } from "../engine/ledger";
import type { AskResponse } from "../engine/types";
import { probeWalnut, type HttpWalnut } from "../walnut/stitches";
import { ApiPanel } from "./ApiPanel";
import { AskPanel } from "./AskPanel";
import { CryptPanel } from "./CryptPanel";
import { GhostsPanel } from "./GhostsPanel";
import { BoltMark } from "./icons";
import { OperatorPanel } from "./OperatorPanel";
import { SourcesPanel, type UploadOutcome } from "./SourcesPanel";

type Tab = "lab" | "parts" | "ghosts" | "crypt" | "api";

const TABS: { id: Tab; label: string }[] = [
  { id: "lab", label: "Laboratory" },
  { id: "parts", label: "Body parts" },
  { id: "ghosts", label: "Ghosts" },
  { id: "crypt", label: "Crypt" },
  { id: "api", label: "API" },
];

function createEngine(): Engine {
  // A fresh random key per page load: the seal proves entries came from this session's ledger.
  return new Engine({ documents: loadDataset().documents, ledger: new Ledger(randomKey()) });
}

export function App() {
  const engineRef = useRef<Engine | null>(null);
  if (!engineRef.current) engineRef.current = createEngine();
  const engine = engineRef.current;

  const [personaId, setPersonaId] = useState("mara");
  const [tab, setTab] = useState<Tab>("lab");
  const [response, setResponse] = useState<AskResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [ghostMsg, setGhostMsg] = useState<string | null>(null);
  const [sealArmed, setSealArmed] = useState(false);
  const [forgeArmed, setForgeArmed] = useState(false);
  const [walnut, setWalnut] = useState<HttpWalnut | null | undefined>(undefined);
  const bump = () => setTick((t) => t + 1);

  // Look for the Walnut stitches once. Found: every answer passes Walnut's grounding wall and
  // every Crypt event is sealed in Walnut's durable ledger. Not found: the in-page engine only.
  useEffect(() => {
    let live = true;
    probeWalnut("").then((w) => {
      if (!live) return;
      engineRef.current?.attachWalnut(w ?? undefined);
      setWalnut(w);
    });
    return () => {
      live = false;
    };
  }, []);

  const persona = personaById(personaId)!;
  const isSteward = persona.groups.includes(STEWARD_GROUP);

  // Recomputed whenever the persona or engine state changes.
  const visibleDocs = useMemo(() => engine.visibleDocuments(persona), [engine, persona, tick]);
  const ghosts = useMemo(() => engine.ghostsFor(persona), [engine, persona, tick]);
  const entries = useMemo(() => engine.ledger.entries(), [engine, tick]);
  const allDocs = useMemo(() => engine.allDocuments(), [engine, tick]);

  const ask = useCallback(
    async (q: string) => {
      setBusy(true);
      try {
        setResponse(await engine.ask(persona, q));
      } finally {
        setSealArmed(engine.ledger.failNext);
        setForgeArmed(engine.forgeNext);
        setBusy(false);
        bump();
      }
    },
    [engine, persona],
  );

  const switchPersona = (id: string) => {
    setPersonaId(id);
    setResponse(null);
    setGhostMsg(null);
  };

  const upload = async (files: File[]): Promise<UploadOutcome[]> => {
    const today = new Date().toISOString().slice(0, 10);
    const out: UploadOutcome[] = [];
    for (const f of files) {
      const r = detectAndParse({ name: f.name, size: f.size, text: f.size <= 512 * 1024 ? await f.text() : "" }, today);
      if (!r.ok) {
        out.push({ name: f.name, ok: false, detail: r.reason });
        continue;
      }
      engine.addDocuments(r.result.documents);
      try {
        await engine.recordStitch(f.name, r.kind, r.passageCount, persona.userId);
      } catch {
        // The upload is still usable; a failed Crypt write is visible to stewards as a missing entry.
      }
      out.push({ name: f.name, ok: true, detail: `${r.passageCount} passage${r.passageCount === 1 ? "" : "s"} stitched in as ${r.kind}${r.result.warnings.length ? `. Warning: ${r.result.warnings.join(" ")}` : ""}` });
    }
    setSealArmed(engine.ledger.failNext);
    bump();
    return out;
  };

  const reset = () => {
    engineRef.current = createEngine();
    engineRef.current.attachWalnut(walnut ?? undefined);
    setResponse(null);
    setGhostMsg(null);
    setSealArmed(false);
    setForgeArmed(false);
    bump();
  };

  return (
    <div className="app">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="top">
        <div className="brand">
          <BoltMark />
          <div>
            <h1>Stitchwork</h1>
            <p className="tagline">One governed answer, sewn from wiki, tickets, chat and sheets.</p>
          </div>
        </div>
        <div className="who">
          <label htmlFor="persona">Who is in the lab?</label>
          <select id="persona" value={personaId} onChange={(e) => switchPersona(e.target.value)}>
            {PERSONAS.map((p) => (
              <option key={p.userId} value={p.userId}>
                {p.name}, {p.role}
              </option>
            ))}
          </select>
          <div className="groups" aria-label="Groups">
            {persona.groups.map((g) => (
              <span key={g} className={`group ${g === STEWARD_GROUP ? "steward" : ""}`}>
                {g}
              </span>
            ))}
          </div>
          <p className={`walnut-badge ${walnut ? "on" : "off"}`} data-testid="walnut-badge" title="The Walnut engine is a vendored, unchanged Apache-2.0 library">
            {walnut === undefined ? "Looking for the Walnut stitches..." : walnut ? "Walnut stitches attached: grounding wall and sealed ledger" : "Walnut stitches not running: in-page engine only"}
          </p>
        </div>
      </header>

      <nav className="tabs" role="tablist" aria-label="Sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="main"
            className={tab === t.id ? "active" : ""}
            onClick={() => setTab(t.id)}
          >
            {t.label}
            {t.id === "ghosts" && ghosts.length > 0 && <span className="pip">{ghosts.length}</span>}
          </button>
        ))}
      </nav>

      <main id="main" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {tab === "lab" && <AskPanel onAsk={ask} response={response} busy={busy} personaName={persona.name} />}
        {tab === "parts" && <SourcesPanel documents={visibleDocs} onUpload={upload} />}
        {tab === "ghosts" && (
          <GhostsPanel
            ghosts={ghosts}
            isSteward={isSteward}
            message={ghostMsg}
            onExorcise={async (docId) => {
              const r = await engine.exorcise(persona, docId);
              setGhostMsg(r.message);
              bump();
            }}
          />
        )}
        {tab === "crypt" && <CryptPanel isSteward={isSteward} entries={entries} onVerify={() => engine.ledger.verify()} onTamper={() => engine.ledger.tamperDemo()} walnut={walnut ?? null} />}
        {tab === "api" && <ApiPanel />}
      </main>

      <footer className="foot">
        <OperatorPanel
          documents={allDocs}
          liveAcl={(id) => engine.liveAcl(id)?.acl}
          sealArmed={sealArmed}
          onChange={async (docId, group, action) => {
            let ok = false;
            try {
              ok = await engine.changeAtSource(docId, group, action, "demo-operator");
            } catch {
              ok = false;
            }
            setSealArmed(engine.ledger.failNext);
            bump();
            return ok;
          }}
          onSealShut={() => {
            engine.ledger.failNext = !engine.ledger.failNext;
            setSealArmed(engine.ledger.failNext);
          }}
          onReset={reset}
          walnutAttached={!!walnut}
          forgeArmed={forgeArmed}
          onForge={() => {
            engine.forgeNext = !engine.forgeNext;
            setForgeArmed(engine.forgeNext);
          }}
        />
        <p className="fine">
          All data is synthetic. Hollowmere Assurance and its people are fictional.{" "}
          {walnut
            ? "Answers and Crypt events go only to the Walnut stitches service on this machine; nothing else leaves the tab."
            : "Nothing you type or upload leaves this browser tab."}{" "}
          MIT licensed; the vendored Walnut engine is Apache-2.0.
        </p>
      </footer>
    </div>
  );
}
