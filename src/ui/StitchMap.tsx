import type { AnswerSentence, Citation } from "../engine/types";
import { KIND_LABEL, KIND_ORDER } from "./icons";

const ROW = 46;
const W = 640;
const LEFT_W = 250;
const RIGHT_X = 420;
const RIGHT_W = 210;

function trim(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}...` : s;
}

/**
 * Deterministic SVG: answer sentences on the left, the four body parts (source kinds) on the right,
 * dashed seams from each sentence to the kind of every source it cites.
 */
export function StitchMap({ sentences, citations }: { sentences: AnswerSentence[]; citations: Citation[] }) {
  const rows = Math.max(sentences.length, KIND_ORDER.length);
  const height = rows * ROW + 20;
  const leftY = (i: number) => 10 + i * ROW + ROW / 2 + ((rows - sentences.length) * ROW) / 2;
  const rightY = (i: number) => 10 + i * ROW + ROW / 2 + ((rows - KIND_ORDER.length) * ROW) / 2;
  const byN = new Map(citations.map((c) => [c.n, c]));
  const usedKinds = new Set(citations.map((c) => c.kind));
  const seams: { key: string; d: string }[] = [];
  sentences.forEach((s, i) => {
    for (const n of s.citations) {
      const c = byN.get(n);
      if (!c) continue;
      const k = KIND_ORDER.indexOf(c.kind);
      const x1 = LEFT_W + 8;
      const y1 = leftY(i);
      const x2 = RIGHT_X - 8;
      const y2 = rightY(k);
      const mid = (x1 + x2) / 2;
      seams.push({ key: `${i}-${n}`, d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` });
    }
  });

  return (
    <figure className="stitch-map">
      <figcaption>Stitch map: which body part each sentence was sewn from</figcaption>
      <svg viewBox={`0 0 ${W} ${height}`} role="img" aria-label={`${sentences.length} sentences stitched from ${usedKinds.size} source kinds`}>
        {sentences.map((s, i) => (
          <g key={`s${i}`} transform={`translate(0 ${leftY(i) - 16})`}>
            <rect width={LEFT_W} height="32" rx="6" className="sm-node" />
            <text x="12" y="20" className="sm-label">
              <tspan className="sm-num">{i + 1}</tspan> {trim(s.text, 34)}
            </text>
          </g>
        ))}
        {KIND_ORDER.map((k, i) => {
          const docs = citations.filter((c) => c.kind === k);
          return (
            <g key={k} transform={`translate(${RIGHT_X} ${rightY(i) - 16})`} className={usedKinds.has(k) ? "sm-on" : "sm-off"}>
              <rect width={RIGHT_W} height="32" rx="6" className="sm-node sm-part" />
              <text x="12" y="20" className="sm-label">
                {KIND_LABEL[k]}
                {docs.length ? `: ${trim(docs.map((d) => d.title).join(", "), 22)}` : ""}
              </text>
            </g>
          );
        })}
        {seams.map((s) => (
          <path key={s.key} d={s.d} className="sm-seam" />
        ))}
      </svg>
    </figure>
  );
}
