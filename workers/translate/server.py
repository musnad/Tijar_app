#!/usr/bin/env python3
"""Local TIJAR Translate worker: POST /v1/translate with HMAC matching tijar-worker.ts."""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"
EN_HA = MODELS / "Helsinki-NLP--opus-mt-en-ha"
HA_EN = MODELS / "Helsinki-NLP--opus-mt-ha-en"

_models = {}


def _norm_lang(value: str) -> str:
    s = (value or "").strip().lower()
    if s in ("en", "eng", "english"):
        return "en"
    if s in ("ha", "hau", "hausa"):
        return "ha"
    return s


def load_models() -> None:
    from transformers import MarianMTModel, MarianTokenizer

    missing = [p for p in (EN_HA, HA_EN) if not p.is_dir() or not any(p.iterdir())]
    if missing:
        raise SystemExit(
            f"Models missing: {missing}. Run: .venv/bin/python download.py"
        )
    print("Loading OPUS-MT en→ha …", flush=True)
    _models["en-ha"] = (
        MarianTokenizer.from_pretrained(str(EN_HA), local_files_only=True),
        MarianMTModel.from_pretrained(str(EN_HA), local_files_only=True),
    )
    print("Loading OPUS-MT ha→en …", flush=True)
    _models["ha-en"] = (
        MarianTokenizer.from_pretrained(str(HA_EN), local_files_only=True),
        MarianMTModel.from_pretrained(str(HA_EN), local_files_only=True),
    )
    print("OPUS-MT ready. Qwen is not loaded (8 GB RAM).", flush=True)


def translate(text: str, src: str, tgt: str) -> str:
    key = f"{src}-{tgt}"
    pair = _models.get(key)
    if pair is None:
        raise ValueError("unsupported_pair")
    tokenizer, model = pair
    encoded = tokenizer(
        text[:1000],
        return_tensors="pt",
        truncation=True,
        max_length=256,
        padding=False,
    )
    generated = model.generate(**encoded, max_new_tokens=256, num_beams=4)
    return tokenizer.decode(generated[0], skip_special_tokens=True).strip()


def verify_hmac(secret: str, timestamp: str, body: bytes, signature: str) -> bool:
    if not secret:
        return True
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False
    now_ms = int(time.time() * 1000)
    if abs(now_ms - ts) > 5 * 60 * 1000:
        return False
    expected = hmac.new(
        secret.encode("utf-8"),
        f"{timestamp}.".encode("utf-8") + body,
        hashlib.sha256,
    ).hexdigest()
    if not signature or len(signature) != len(expected):
        return False
    return hmac.compare_digest(expected, signature.lower())


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt: str, *args) -> None:
        sys_stderr = __import__("sys").stderr
        sys_stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def _json(self, status: int, payload: dict) -> None:
        raw = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self) -> None:
        if self.path.rstrip("/") in ("", "/health"):
            self._json(200, {"ok": True, "engine": "opus-mt", "pairs": ["en-ha", "ha-en"]})
            return
        self._json(404, {"error": "not_found"})

    def do_POST(self) -> None:
        if self.path.rstrip("/") != "/v1/translate":
            self._json(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length") or "0")
        if length > 20_000:
            self._json(413, {"error": "too_large"})
            return
        body = self.rfile.read(length)
        secret = os.environ.get("TIJAR_TRANSLATE_SECRET", "").strip()
        timestamp = self.headers.get("X-Tijar-Timestamp") or ""
        signature = (self.headers.get("X-Tijar-Signature") or "").strip()
        auth = self.headers.get("Authorization") or ""
        if secret:
            bearer_ok = auth == f"Bearer {secret}"
            hmac_ok = verify_hmac(secret, timestamp, body, signature)
            if not hmac_ok and not bearer_ok:
                self._json(401, {"error": "unauthorized"})
                return
        try:
            data = json.loads(body.decode("utf-8"))
        except json.JSONDecodeError:
            self._json(400, {"error": "invalid_json"})
            return
        text = str(data.get("text") or "").strip()
        src = _norm_lang(str(data.get("fromLanguage") or ""))
        tgt = _norm_lang(str(data.get("toLanguage") or ""))
        if not text:
            self._json(400, {"error": "text_required"})
            return
        if src == tgt:
            self._json(200, {"translatedText": text})
            return
        try:
            out = translate(text, src, tgt)
        except ValueError:
            self._json(400, {"error": "unsupported_pair", "hint": "Hausa↔English only on this worker"})
            return
        except Exception as exc:
            self._json(503, {"error": "translate_failed", "detail": str(exc)[:200]})
            return
        if not out:
            self._json(503, {"error": "empty"})
            return
        self._json(200, {"translatedText": out})


def main() -> None:
    host = os.environ.get("TIJAR_TRANSLATE_HOST", "127.0.0.1")
    port = int(os.environ.get("TIJAR_TRANSLATE_PORT", "8787"))
    load_models()
    httpd = ThreadingHTTPServer((host, port), Handler)
    print(f"TIJAR Translate worker http://{host}:{port}/v1/translate", flush=True)
    httpd.serve_forever()


if __name__ == "__main__":
    main()
