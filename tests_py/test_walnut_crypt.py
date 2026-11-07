"""Stitchwork's durable Crypt on Walnut's sealed DecisionLedger, and the loopback service."""
import json
import threading
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import pytest

from stitch_walnut.server import StitchService, build, make_handler
from stitch_walnut.walnut import BadRequest, DecisionRefused, WalnutCrypt

KEY = b"k" * 64


@pytest.fixture()
def crypt(tmp_path):
    return WalnutCrypt(tmp_path / "crypt.jsonl", KEY)


def test_seals_chain_in_order_and_verify(crypt):
    a = crypt.seal("request.accepted", {"requestId": "r1", "userId": "mara"})
    b = crypt.seal("retrieval.decided", {"requestId": "r1"})
    c = crypt.seal("answer.released", {"requestId": "r1", "status": "answered"})
    assert [a["seq"], b["seq"], c["seq"]] == [1, 2, 3]
    assert b["prev"] == a["hash"] and c["prev"] == b["hash"]
    v = crypt.verify()
    assert v == {"ok": True, "why": "", "count": 3, "head": c["hash"]}
    assert [e["type"] for e in crypt.entries()] == ["request.accepted", "retrieval.decided",
                                                    "answer.released"]


def test_the_crypt_is_durable_across_processes(tmp_path):
    WalnutCrypt(tmp_path / "crypt.jsonl", KEY).seal("request.accepted", {"requestId": "r1"})
    again = WalnutCrypt(tmp_path / "crypt.jsonl", KEY)
    assert again.verify()["count"] == 1
    assert again.seal("answer.released", {"requestId": "r1"})["seq"] == 2


def test_a_different_key_cannot_extend_or_verify_the_crypt(tmp_path):
    WalnutCrypt(tmp_path / "crypt.jsonl", KEY).seal("request.accepted", {"requestId": "r1"})
    thief = WalnutCrypt(tmp_path / "crypt.jsonl", b"x" * 64)
    assert thief.verify()["ok"] is False
    with pytest.raises(DecisionRefused):
        thief.seal("answer.released", {"requestId": "r1"})


def test_an_edited_crypt_refuses_every_further_seal(crypt):
    crypt.seal("request.accepted", {"requestId": "r1"})
    crypt.seal("answer.released", {"requestId": "r1"})
    lines = crypt.path.read_text(encoding="utf-8").splitlines()
    rec = json.loads(lines[0])
    rec["data"]["requestId"] = "r-forged"
    lines[0] = json.dumps(rec, sort_keys=True)
    crypt.path.write_text("\n".join(lines) + "\n", encoding="utf-8")
    assert crypt.verify()["ok"] is False
    with pytest.raises(DecisionRefused):
        crypt.seal("request.accepted", {"requestId": "r2"})


def test_tamper_demo_detects_every_attack_on_copies_and_leaves_the_real_crypt_untouched(crypt):
    for i in range(3):
        crypt.seal("request.accepted", {"requestId": f"r{i}"})
    before = crypt.path.read_bytes()
    r = crypt.tamper_demo()
    assert r["untouched"] is True
    assert [a["attack"] for a in r["attacks"]] == ["edit one entry", "delete the last entry",
                                                   "reorder two entries"]
    assert all(a["detected"] and a["why"] for a in r["attacks"])
    assert crypt.path.read_bytes() == before
    assert crypt.verify()["ok"] is True


def test_unknown_event_types_are_refused(crypt):
    with pytest.raises(BadRequest):
        crypt.seal("answer.deleted", {})


def test_the_service_refuses_to_start_without_a_key(tmp_path, monkeypatch):
    monkeypatch.delenv("STITCH_WALNUT_KEY", raising=False)
    with pytest.raises(SystemExit):
        build(tmp_path / "c.jsonl", ephemeral=False, root=tmp_path)
    monkeypatch.setenv("STITCH_WALNUT_KEY", "short")
    with pytest.raises(SystemExit):
        build(tmp_path / "c.jsonl", ephemeral=False, root=tmp_path)


@pytest.fixture()
def service(tmp_path):
    svc = StitchService(WalnutCrypt(tmp_path / "crypt.jsonl", KEY), ephemeral=True)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(svc))
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}", svc
    httpd.shutdown()
    httpd.server_close()


def _call(base, path, body=None):
    req = urllib.request.Request(base + path, method="POST" if body is not None else "GET",
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def test_the_http_service_end_to_end(service):
    base, _svc = service
    status, h = _call(base, "/walnut/health")
    assert status == 200 and h["engine"] == "walnut" and len(h["manifest"]) == 64
    status, g = _call(base, "/walnut/ground", {
        "sentences": [{"text": "Refunds take 14 days.", "citations": [1]},
                      {"text": "Refunds take 99 days.", "citations": [1]}],
        "citations": [{"n": 1, "text": "Refunds take 14 days.", "kind": "wiki"}]})
    assert status == 200 and [s["kept"] for s in g["sentences"]] == [True, False]
    status, s = _call(base, "/walnut/seal", {"type": "request.accepted", "data": {"requestId": "r1"}})
    assert status == 200 and s["seq"] == 1
    assert _call(base, "/walnut/verify")[1]["ok"] is True
    assert _call(base, "/walnut/seal", {"type": "nope", "data": {}})[0] == 400
    assert _call(base, "/walnut/nowhere")[0] == 404
    status, t = _call(base, "/walnut/tamper-demo", {})
    assert status == 200 and t["untouched"] is True


def test_a_broken_crypt_is_a_503_not_a_silent_success(service):
    base, svc = service
    _call(base, "/walnut/seal", {"type": "request.accepted", "data": {"requestId": "r1"}})
    svc.crypt.path.write_text("not a record\n", encoding="utf-8")
    status, body = _call(base, "/walnut/seal", {"type": "request.accepted", "data": {}})
    assert status == 503 and body["error"] == "walnut_refused"
