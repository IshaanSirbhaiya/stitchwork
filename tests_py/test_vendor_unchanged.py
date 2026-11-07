"""The vendored Walnut engine is byte-for-byte the pre-existing library, with nothing added."""
import hashlib
import sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parents[1] / "vendor" / "walnut"


def _manifest() -> dict[str, str]:
    out = {}
    for line in (VENDOR / "MANIFEST.sha256").read_text(encoding="utf-8").splitlines():
        if line.strip():
            digest, rel = line.split("  ", 1)
            out[rel] = digest
    return out


def _engine_files() -> list[Path]:
    return [p for root in ("packages", "apps") for p in (VENDOR / root).rglob("*")
            if p.is_file() and "__pycache__" not in p.parts]


def test_every_vendored_file_matches_its_manifest_digest():
    manifest = _manifest()
    assert len(manifest) == 13
    for rel, digest in manifest.items():
        assert hashlib.sha256((VENDOR / rel).read_bytes()).hexdigest() == digest, rel


def test_no_file_was_added_to_the_vendored_engine():
    on_disk = {p.relative_to(VENDOR).as_posix() for p in _engine_files()}
    assert on_disk == set(_manifest())


def test_the_licence_and_notice_ship_with_it():
    assert "Apache License" in (VENDOR / "LICENSE").read_text(encoding="utf-8")
    assert "unmodified" in (VENDOR / "NOTICE").read_text(encoding="utf-8")


def test_the_stitches_never_import_the_rest_of_the_walnut_gateway():
    import stitch_walnut.walnut  # noqa: F401
    assert not [m for m in sys.modules if m == "databridge_gateway" or m.startswith("databridge_gateway.")]
