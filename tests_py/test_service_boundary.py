"""The stitches' boundary, over real HTTP against the real handler (a real socket, no direct calls).

Each request is what a browser or another local process would really send. Before this file existed
a web page could seal a forged event, and any caller could read every person's questions.
"""
import http.client
import json
import threading
from http.server import ThreadingHTTPServer

import pytest

from stitch_walnut.server import StitchService, build, make_handler
from stitch_walnut.walnut import WalnutCrypt

KEY = b"k" * 32
CALLER = "c" * 40


def _serve(tmp_path, **kw):
    svc = StitchService(WalnutCrypt(tmp_path / "crypt.jsonl", KEY), ephemeral=True, **kw)
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(svc))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, svc


@pytest.fixture()
def open_service(tmp_path):
    httpd, svc = _serve(tmp_path)
    yield httpd.server_address[1], svc
    httpd.shutdown()
    httpd.server_close()


@pytest.fixture()
def keyed_service(tmp_path):
    httpd, svc = _serve(tmp_path, caller_key=CALLER)
    yield httpd.server_address[1], svc
    httpd.shutdown()
    httpd.server_close()


def _raw(port, method, path, headers=None, body=None):
    """Send exact headers, so a rebinding Host or a foreign Origin can be sent as a browser would."""
    conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
    conn.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
    sent = {"Host": f"127.0.0.1:{port}", **(headers or {})}
    data = body.encode() if isinstance(body, str) else body
    if data is not None:
        sent["Content-Length"] = str(len(data))
    for k, v in sent.items():
        conn.putheader(k, v)
    conn.endheaders(data)
    r = conn.getresponse()
    out = r.status, json.loads(r.read() or b"{}")
    conn.close()
    return out


SEAL = json.dumps({"type": "answer.released", "data": {"forged": "by a web page"}})
JSON_CT = {"Content-Type": "application/json"}


def _count(svc):
    return svc.crypt.verify()["count"]


def test_a_cross_site_simple_post_cannot_seal(open_service):
    port, svc = open_service
    assert _raw(port, "POST", "/walnut/seal", {"Content-Type": "text/plain", "Origin": "https://evil.example"}, SEAL)[0] == 403
    assert _raw(port, "POST", "/walnut/seal", {"Content-Type": "text/plain"}, SEAL)[0] == 415
    assert _raw(port, "POST", "/walnut/seal", {"Content-Type": "application/x-www-form-urlencoded"}, SEAL)[0] == 415
    assert _count(svc) == 0


def test_a_foreign_or_null_origin_is_refused_even_with_json(open_service):
    port, svc = open_service
    for origin in ("https://evil.example", "null", "http://127.0.0.1.evil.example"):
        assert _raw(port, "POST", "/walnut/seal", {**JSON_CT, "Origin": origin}, SEAL)[0] == 403
    assert _count(svc) == 0


def test_dns_rebinding_is_refused_by_the_host_check(open_service):
    port, svc = open_service
    assert _raw(port, "GET", "/walnut/verify", {"Host": f"evil.example:{port}"})[0] == 403
    assert _raw(port, "POST", "/walnut/seal", {**JSON_CT, "Host": "evil.example"}, SEAL)[0] == 403
    assert _count(svc) == 0


def test_the_same_origin_browser_flow_through_the_dev_proxy_still_works(open_service):
    port, svc = open_service
    assert _raw(port, "POST", "/walnut/seal", {**JSON_CT, "Origin": "http://127.0.0.1:4700", "Host": "127.0.0.1:4700"}, SEAL)[0] == 200
    assert _raw(port, "POST", "/walnut/seal", {**JSON_CT, "Origin": "http://localhost:5173", "Host": "localhost:5173"}, SEAL)[0] == 200
    assert _count(svc) == 2


def test_nobody_can_read_other_peoples_questions_over_http(open_service):
    port, svc = open_service
    svc.crypt.seal("request.accepted", {"requestId": "r1", "userId": "iris", "question": "Is Gravewell under investigation?"})
    assert _raw(port, "GET", "/walnut/entries")[0] == 404
    status, verify = _raw(port, "GET", "/walnut/verify")
    assert status == 200 and "Gravewell" not in json.dumps(verify) and "iris" not in json.dumps(verify)


def test_with_a_caller_key_every_route_but_health_needs_it(keyed_service):
    port, svc = keyed_service
    assert _raw(port, "GET", "/walnut/health")[0] == 200
    for method, path, body in (("GET", "/walnut/verify", None), ("POST", "/walnut/seal", SEAL),
                               ("POST", "/walnut/ground", '{"sentences":[],"citations":[]}'),
                               ("POST", "/walnut/tamper-demo", "{}")):
        headers = JSON_CT if body else {}
        assert _raw(port, method, path, headers, body)[0] == 401
        assert _raw(port, method, path, {**headers, "X-Stitch-Caller-Key": "wrong"}, body)[0] == 401
    assert _count(svc) == 0
    assert _raw(port, "POST", "/walnut/seal", {**JSON_CT, "X-Stitch-Caller-Key": CALLER}, SEAL)[0] == 200
    assert _count(svc) == 1


def test_an_extra_allowed_host_is_opt_in(tmp_path):
    httpd, _svc = _serve(tmp_path, allowed_hosts=frozenset({"demo.example"}))
    try:
        port = httpd.server_address[1]
        assert _raw(port, "GET", "/walnut/verify", {"Host": "demo.example"})[0] == 200
        assert _raw(port, "GET", "/walnut/verify", {"Host": "other.example"})[0] == 403
    finally:
        httpd.shutdown()
        httpd.server_close()


def test_a_durable_crypt_will_not_start_without_a_caller_key(tmp_path, monkeypatch):
    monkeypatch.setenv("STITCH_WALNUT_KEY", "x" * 40)
    monkeypatch.delenv("STITCH_WALNUT_CALLER_KEY", raising=False)
    with pytest.raises(SystemExit):
        build(tmp_path / "c.jsonl", ephemeral=False, root=tmp_path)
    monkeypatch.setenv("STITCH_WALNUT_CALLER_KEY", "short")
    with pytest.raises(SystemExit):
        build(tmp_path / "c.jsonl", ephemeral=False, root=tmp_path)
    monkeypatch.setenv("STITCH_WALNUT_CALLER_KEY", CALLER)
    assert build(tmp_path / "c.jsonl", ephemeral=False, root=tmp_path).caller_key == CALLER
