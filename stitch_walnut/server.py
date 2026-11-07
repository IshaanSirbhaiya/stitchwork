"""The Walnut stitches as a loopback JSON service for the Stitchwork engine (new Stitchwork code).

Routes (all JSON, all under ``/walnut``):

    GET  /walnut/health        engine status and the vendored-manifest digest
    POST /walnut/ground        Walnut grounding wall over stitched sentences
    POST /walnut/seal          append one sealed event to the durable Crypt (DecisionLedger)
    GET  /walnut/verify        verify the whole Crypt and its anchor
    POST /walnut/tamper-demo   attack copies of the Crypt; the real one is hashed before and after

It binds to 127.0.0.1 only. Any Walnut refusal (no key, a broken chain) is a 503, and the
Stitchwork engine treats any non-200 as "release nothing".

There is no route that returns Crypt records: they hold every person's questions and denial counts.
Binding to loopback does not stop a web page in the same machine's browser, so every request is
also checked: the Host and any Origin must be loopback (or named in STITCH_WALNUT_ALLOW_HOSTS), which
stops other sites and DNS rebinding, and a POST must be application/json, which a page cannot send
cross-site without a CORS preflight this service never approves. A durable Crypt also needs a caller
key (STITCH_WALNUT_CALLER_KEY, header x-stitch-caller-key) on every route except health.
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import secrets
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlsplit

from .walnut import VENDOR, BadRequest, DecisionRefused, WalnutCrypt, ground

KEY_ENV = "STITCH_WALNUT_KEY"
CALLER_KEY_ENV = "STITCH_WALNUT_CALLER_KEY"
ALLOW_HOSTS_ENV = "STITCH_WALNUT_ALLOW_HOSTS"
CALLER_HEADER = "x-stitch-caller-key"
LOOPBACK = frozenset({"127.0.0.1", "localhost", "::1"})
MIN_KEY_CHARS = 32
MAX_BODY = 64 * 1024


def manifest_digest() -> str:
    m = VENDOR / "MANIFEST.sha256"
    return hashlib.sha256(m.read_bytes()).hexdigest() if m.is_file() else ""


class StitchService:
    def __init__(self, crypt: WalnutCrypt, *, ephemeral: bool, caller_key: Optional[str] = None,
                 allowed_hosts: frozenset[str] = frozenset()) -> None:
        self.crypt = crypt
        self.ephemeral = ephemeral
        self.caller_key = caller_key
        self.allowed_hosts = LOOPBACK | allowed_hosts

    def refusal(self, method: str, path: str, headers: Any) -> Optional[tuple[int, dict]]:
        """Why this request may not proceed, before its body is parsed. None means it may."""
        try:
            host = urlsplit("//" + headers.get("host", "")).hostname
            origin = headers.get("origin")
            origin_host = urlsplit(origin).hostname if origin is not None else None
        except ValueError:
            return 403, {"error": "host_refused"}
        if host not in self.allowed_hosts:
            return 403, {"error": "host_refused"}
        if origin is not None and origin_host not in self.allowed_hosts:
            return 403, {"error": "origin_refused"}
        if method == "POST" and headers.get("content-type", "").split(";")[0].strip().lower() != "application/json":
            return 415, {"error": "json_only"}
        if self.caller_key and path != "/walnut/health" and \
                not hmac.compare_digest(headers.get(CALLER_HEADER, "").encode(), self.caller_key.encode()):
            return 401, {"error": "caller_key_required"}
        return None

    def health(self) -> dict:
        return {"ok": True, "engine": "walnut", "vendored": "vendor/walnut (Apache-2.0, unchanged)",
                "manifest": manifest_digest(), "ephemeralKey": self.ephemeral,
                "parts": ["grounding wall", "source pointers", "sealed decision ledger"]}

    def handle(self, method: str, path: str, body: Optional[dict]) -> tuple[int, Any]:
        try:
            if method == "GET" and path == "/walnut/health":
                return 200, self.health()
            if method == "POST" and path == "/walnut/ground":
                return 200, ground(body or {})
            if method == "POST" and path == "/walnut/seal":
                b = body or {}
                return 200, self.crypt.seal(str(b.get("type", "")), b.get("data", {}))
            if method == "GET" and path == "/walnut/verify":
                return 200, self.crypt.verify()
            if method == "POST" and path == "/walnut/tamper-demo":
                return 200, self.crypt.tamper_demo()
            return 404, {"error": "not_found"}
        except BadRequest as exc:
            return 400, {"error": "bad_request", "message": str(exc)}
        except DecisionRefused as exc:
            return 503, {"error": "walnut_refused", "code": exc.code, "message": exc.message}
        except Exception:  # noqa: BLE001  anything unexpected releases nothing
            return 500, {"error": "internal"}


def make_handler(service: StitchService):
    class Handler(BaseHTTPRequestHandler):
        server_version = "StitchWalnut/1"

        def log_message(self, fmt, *args):  # quiet by default
            if os.environ.get("STITCH_WALNUT_LOG"):
                sys.stderr.write(fmt % args + "\n")

        def _send(self, status: int, payload: Any) -> None:
            data = json.dumps(payload, default=str).encode("utf-8")
            self.send_response(status)
            self.send_header("content-type", "application/json; charset=utf-8")
            self.send_header("cache-control", "no-store")
            self.send_header("content-length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _route(self, method: str) -> None:
            path = self.path.split("?", 1)[0].rstrip("/")
            refused = service.refusal(method, path, self.headers)
            if refused:
                # Read what was sent (never parsed): closing with unread data resets the connection
                # on Windows, and the caller would lose the status.
                self.rfile.read(min(int(self.headers.get("content-length") or 0), MAX_BODY))
                return self._send(*refused)
            body = None
            if method == "POST":
                n = int(self.headers.get("content-length") or 0)
                if n > MAX_BODY:
                    return self._send(413, {"error": "too_large"})
                try:
                    body = json.loads(self.rfile.read(n) or b"{}")
                except ValueError:
                    return self._send(400, {"error": "bad_json"})
                if not isinstance(body, dict):
                    return self._send(400, {"error": "bad_json"})
            status, payload = service.handle(method, path, body)
            self._send(status, payload)

        def do_GET(self):  # noqa: N802
            self._route("GET")

        def do_POST(self):  # noqa: N802
            self._route("POST")

    return Handler


def build(ledger: Optional[Path], *, ephemeral: bool, root: Path) -> StitchService:
    caller_key = os.environ.get(CALLER_KEY_ENV, "").strip() or None
    extra = frozenset(h.strip().lower() for h in os.environ.get(ALLOW_HOSTS_ENV, "").split(",") if h.strip())
    if ephemeral:
        key = secrets.token_hex(32).encode("ascii")
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
        path = ledger or root / "var" / "walnut" / f"ephemeral-{stamp}-{os.getpid()}" / "crypt.jsonl"
    else:
        raw = os.environ.get(KEY_ENV, "").strip()
        if len(raw) < MIN_KEY_CHARS:
            raise SystemExit(f"{KEY_ENV} must hold at least {MIN_KEY_CHARS} characters "
                             f"(or pass --ephemeral-key for a throwaway demo Crypt)")
        if len(caller_key or "") < MIN_KEY_CHARS:
            raise SystemExit(f"{CALLER_KEY_ENV} must hold at least {MIN_KEY_CHARS} characters for a "
                             f"durable Crypt, so only the Stitchwork API can write to it")
        key = raw.encode("utf-8")
        path = ledger or root / "var" / "walnut" / "crypt.jsonl"
    return StitchService(WalnutCrypt(path, key), ephemeral=ephemeral, caller_key=caller_key, allowed_hosts=extra)


def main(argv: Optional[list[str]] = None) -> None:
    ap = argparse.ArgumentParser(prog="python -m stitch_walnut",
                                 description="Walnut stitches for Stitchwork (loopback only)")
    ap.add_argument("--port", type=int, default=4711)
    ap.add_argument("--ledger", type=Path, default=None, help="path of the durable Crypt (JSONL)")
    ap.add_argument("--ephemeral-key", action="store_true",
                    help="random key for this process and a fresh Crypt file (demo only)")
    args = ap.parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    service = build(args.ledger, ephemeral=args.ephemeral_key, root=root)
    httpd = ThreadingHTTPServer(("127.0.0.1", args.port), make_handler(service))
    print(f"Walnut stitches on http://127.0.0.1:{args.port}/walnut (Crypt: {service.crypt.path})",
          flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
