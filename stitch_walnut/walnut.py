"""The Walnut stitches: Stitchwork's thin binding to the vendored, unchanged Walnut engine.

Three parts of Walnut are used, all imported from ``vendor/walnut`` and never edited:

* the grounding wall (``vendor/walnut/apps/gateway/databridge_gateway/llm.py``):
  ``ground_narration``, ``unsupported_named_terms``, ``identity_assertion_violations`` and
  ``bind_sentences``. The module is loaded from its file under a private name, so none of the
  rest of the Walnut gateway is imported;
* source pointers (``databridge_core.provenance.SourcePointer``): every kept sentence gets a
  sealed ``doc_span`` pointer per citation, with a trust label from the source kind;
* the sealed decision ledger (``databridge_core.decision_ledger.DecisionLedger``): an
  append-only, SHA-256 hash-chained, HMAC-sealed and anchored JSONL log. It is the durable
  Crypt behind Stitchwork.

Everything in this file is new Stitchwork code written for Kiroween 2026.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import shutil
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Mapping

REPO = Path(__file__).resolve().parents[1]
VENDOR = REPO / "vendor" / "walnut"
_CORE = VENDOR / "packages" / "core"
_WALL = VENDOR / "apps" / "gateway" / "databridge_gateway" / "llm.py"
_WALL_NAME = "stitch_walnut._walnut_grounding_wall"

if str(_CORE) not in sys.path:
    sys.path.insert(0, str(_CORE))

from databridge_core.decision_ledger import DecisionLedger, DecisionRefused  # noqa: E402
from databridge_core.provenance import SourcePointer, Trust  # noqa: E402


def _load_wall():
    if _WALL_NAME in sys.modules:
        return sys.modules[_WALL_NAME]
    spec = importlib.util.spec_from_file_location(_WALL_NAME, _WALL)
    mod = importlib.util.module_from_spec(spec)
    sys.modules[_WALL_NAME] = mod
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    return mod


_wall = _load_wall()
ground_narration = _wall.ground_narration
unsupported_named_terms = _wall.unsupported_named_terms
identity_assertion_violations = _wall.identity_assertion_violations
bind_sentences = _wall.bind_sentences

#: Source kinds whose text anyone in a channel or queue can write. Walnut labels such text
#: untrusted however accurate it is: it may be quoted, never acted on.
UNTRUSTED_KINDS = frozenset({"chat", "ticket"})

#: The Crypt events Stitchwork may seal. Anything else is refused.
CRYPT_TYPES = frozenset({"request.accepted", "retrieval.decided", "answer.released",
                         "ghost.exorcised", "source.stitched", "acl.changed"})

MAX_SENTENCES = 12
MAX_CITATIONS = 12
MAX_TEXT = 4000


class BadRequest(ValueError):
    """The caller sent something the stitches will not process."""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


def _context(cites: Iterable[Mapping[str, Any]]) -> str:
    """Walnut's tagged fact-line format: one ``- [C<n>] text`` line per cited passage."""
    return "\n".join(f"- [C{int(c['n'])}] {' '.join(str(c['text']).split())}" for c in cites)


def _span(sentence: str, passage: str) -> tuple[int, int]:
    """Where the quoted sentence sits in the passage, or the whole passage when it was clipped
    or joined. The pointer is re-checkable: ``passage[start:end]`` is the cited text."""
    probe = sentence[:-3] if sentence.endswith("...") else sentence
    i = passage.find(probe)
    return (i, i + len(probe)) if i >= 0 and probe else (0, len(passage))


def pointer_for(citation: Mapping[str, Any], sentence: str) -> dict:
    """A sealed Walnut ``doc_span`` SourcePointer for one citation of one kept sentence."""
    text = str(citation["text"])
    start, end = _span(sentence, text)
    kind = str(citation.get("kind", ""))
    ptr = SourcePointer(
        source_id=str(citation.get("sourceName") or kind or "unknown"),
        kind="doc_span",
        document_id=str(citation.get("passageId") or citation.get("docId")),
        char_start=start,
        char_end=end,
        trust=Trust.UNTRUSTED if kind in UNTRUSTED_KINDS else Trust.TRUSTED,
        capture_digest=hashlib.sha256(text.encode("utf-8")).hexdigest(),
    )
    return ptr.model_dump(mode="json", exclude_none=True)


def _validate_ground(body: Mapping[str, Any]) -> tuple[list[dict], dict[int, dict]]:
    sentences = body.get("sentences")
    citations = body.get("citations")
    if not isinstance(sentences, list) or not isinstance(citations, list):
        raise BadRequest("sentences and citations must be lists")
    if len(sentences) > MAX_SENTENCES or len(citations) > MAX_CITATIONS:
        raise BadRequest("too many sentences or citations")
    by_n: dict[int, dict] = {}
    for c in citations:
        if not isinstance(c, dict) or not isinstance(c.get("n"), int) or \
                not isinstance(c.get("text"), str) or len(c["text"]) > MAX_TEXT:
            raise BadRequest("each citation needs an integer n and a text")
        by_n[c["n"]] = c
    out = []
    for s in sentences:
        if not isinstance(s, dict) or not isinstance(s.get("text"), str) or \
                len(s["text"]) > MAX_TEXT or not isinstance(s.get("citations"), list) or \
                not all(isinstance(n, int) for n in s["citations"]):
            raise BadRequest("each sentence needs a text and a list of citation numbers")
        out.append(s)
    return out, by_n


def ground(body: Mapping[str, Any]) -> dict:
    """Run Walnut's grounding wall over each stitched sentence, against ONLY the passages that
    sentence cites. A sentence is kept when every value it states is bound to a cited fact line,
    every capitalised name it uses appears in its cited passages, it asserts no identity as
    verified, and it shares a fact with its sources (``bind_sentences``). Otherwise it is
    dropped, with the wall's reasons."""
    sentences, by_n = _validate_ground(body)
    verdicts = []
    for i, s in enumerate(sentences):
        text = s["text"]
        cited = [by_n[n] for n in s["citations"] if n in by_n]
        reasons: list[str] = []
        bound: list[dict] = []
        if not cited:
            reasons.append("cites no passage")
        else:
            ctx = _context(cited)
            verdict = ground_narration(text, ctx)
            bound = verdict["bound"]
            reasons += [f"value not in its sources: {v}" for v in verdict["unbound"]]
            reasons += [f"name not in its sources: {t}" for t in unsupported_named_terms(text, ctx)]
            reasons += [f"asserts an identity: {t}" for t in identity_assertion_violations(text)]
            served, _dropped = bind_sentences(text, ctx, bound)
            if not served and not reasons:
                reasons.append("binds to no fact in its sources")
        kept = not reasons
        verdicts.append({
            "index": i,
            "kept": kept,
            "reasons": reasons,
            "bound": [{"value": b["token"], "tags": b["tags"]} for b in bound],
            "pointers": [{"n": c["n"], "pointer": pointer_for(c, text)} for c in cited] if kept else [],
        })
    return {"engine": "walnut", "sentences": verdicts,
            "kept": sum(v["kept"] for v in verdicts),
            "dropped": sum(not v["kept"] for v in verdicts)}


class WalnutCrypt:
    """Stitchwork's durable Crypt: Walnut's ``DecisionLedger``, used as is."""

    def __init__(self, path: Path, key: bytes) -> None:
        self.path = Path(path)
        self.key = key
        self.ledger = DecisionLedger(self.path, key=key, what="Stitchwork Crypt")

    def seal(self, type_: str, data: Mapping[str, Any]) -> dict:
        if type_ not in CRYPT_TYPES:
            raise BadRequest(f"unknown Crypt event type: {type_}")
        if not isinstance(data, Mapping):
            raise BadRequest("data must be an object")
        if len(json.dumps(data, default=str)) > 16_000:
            raise BadRequest("data too large")
        rec = self.ledger.append({"type": type_, "at": _now(), "data": dict(data)})
        return {"type": type_, "seq": rec["seq"], "hash": rec["hash"], "prev": rec["prev"],
                "seal": rec["seal"], "at": rec["at"]}

    def entries(self) -> list[dict]:
        return self.ledger.read()

    def verify(self) -> dict:
        ok, why = self.ledger.verify()
        recs = self.ledger.inspect()[0]
        return {"ok": ok, "why": why, "count": len(recs),
                "head": recs[-1]["hash"] if recs else None}

    def tamper_demo(self) -> dict:
        """Attack COPIES of the log (and its anchor ledger) and verify each copy with Walnut.
        The real Crypt's bytes are hashed before and after to prove it was not touched."""
        before = self._fingerprint()
        recs = self.ledger.read(raw=True)
        if not recs:
            return {"attacks": [], "untouched": True, "note": "The Crypt is empty. Ask a question first."}
        attacks = []
        for name, attack in (("edit one entry", self._edit), ("delete the last entry", self._drop_last),
                             ("reorder two entries", self._swap)):
            if name == "reorder two entries" and len(self._lines(self.path)) < 2:
                continue
            with tempfile.TemporaryDirectory(prefix="stitch-tamper-") as tmp:
                copy = Path(tmp) / self.path.name
                shutil.copyfile(self.path, copy)
                anchors = self.ledger.anchors_path
                if anchors.is_file():
                    shutil.copyfile(anchors, Path(tmp) / anchors.name)
                attack(copy)
                ok, why = DecisionLedger(copy, key=self.key, what="tampered copy").verify()
                attacks.append({"attack": name, "detected": not ok, "why": why})
        return {"attacks": attacks, "untouched": self._fingerprint() == before}

    def _fingerprint(self) -> str:
        h = hashlib.sha256()
        for p in (self.path, self.ledger.anchors_path):
            h.update(p.read_bytes() if p.is_file() else b"-")
        return h.hexdigest()

    @staticmethod
    def _lines(p: Path) -> list[str]:
        return [ln for ln in p.read_text(encoding="utf-8").splitlines() if ln.strip()]

    @classmethod
    def _write(cls, p: Path, lines: list[str]) -> None:
        p.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")

    @classmethod
    def _edit(cls, p: Path) -> None:
        lines = cls._lines(p)
        i = len(lines) // 2
        rec = json.loads(lines[i])
        rec["data"] = {**rec.get("data", {}), "tampered": "a quiet edit by someone who should not have"}
        lines[i] = json.dumps(rec, sort_keys=True)
        cls._write(p, lines)

    @classmethod
    def _drop_last(cls, p: Path) -> None:
        cls._write(p, cls._lines(p)[:-1])

    @classmethod
    def _swap(cls, p: Path) -> None:
        lines = cls._lines(p)
        lines[0], lines[1] = lines[1], lines[0]
        cls._write(p, lines)


__all__ = ["ground", "pointer_for", "WalnutCrypt", "BadRequest", "DecisionRefused",
           "CRYPT_TYPES", "UNTRUSTED_KINDS", "VENDOR"]
