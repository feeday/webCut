from __future__ import annotations

import argparse
import errno
import http.server
import json
import re
import urllib.error
import urllib.parse
import urllib.request
import os
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 18080


QWEN_ORIGIN = "https://qwen-qwen3-asr-demo.hf.space"
MAX_ASR_BODY = 2 * 1024 * 1024
ASR_SLOTS = threading.BoundedSemaphore(4)


def allowed_qwen_path(path: str, method: str) -> bool:
    if method == "POST":
        return path in {"/upload", "/call/asr_inference"}
    return method == "GET" and re.fullmatch(r"/call/asr_inference/[A-Za-z0-9_-]{1,128}", path) is not None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None  # Never forward the user's token to a different destination.


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def send_json(self, code, payload):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/api/qwen/status":
            self.send_json(200, {"webcut_qwen_proxy": True})
        elif self.path.startswith("/api/qwen/"):
            self.proxy_qwen()
        else:
            super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/qwen/"):
            self.proxy_qwen()
        else:
            self.send_error(404)

    def proxy_qwen(self):
        path = self.path.removeprefix("/api/qwen")
        if not allowed_qwen_path(path, self.command):
            return self.send_json(404, {"error": "Unsupported Qwen endpoint"})
        # Same-origin only; no permissive CORS headers and no arbitrary target URLs.
        origin = self.headers.get("Origin")
        if self.headers.get("X-WebCut-ASR") != "1" or (origin and urllib.parse.urlsplit(origin).netloc != self.headers.get("Host")):
            return self.send_json(403, {"error": "Same-origin requests only"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self.send_json(400, {"error": "Invalid content length"})
        if length < 0 or length > MAX_ASR_BODY:
            return self.send_json(413, {"error": "Audio chunk too large"})
        if not ASR_SLOTS.acquire(blocking=False):
            return self.send_json(429, {"error": "Too many active ASR requests"})
        try:
            self.connection.settimeout(190)
            body = self.rfile.read(length) if self.command == "POST" else None
            if body is not None and len(body) != length:
                return self.send_json(400, {"error": "Incomplete request"})
            headers = {"User-Agent": "webCut/0.6.4"}
            if self.headers.get("Content-Type"):
                headers["Content-Type"] = self.headers["Content-Type"]
            auth = self.headers.get("Authorization", "")
            if auth:
                if not re.fullmatch(r"Bearer hf_[A-Za-z0-9_]+", auth):
                    return self.send_json(400, {"error": "Invalid HF token format"})
                headers["Authorization"] = auth
            request = urllib.request.Request(QWEN_ORIGIN + "/gradio_api" + path, data=body, headers=headers, method=self.command)
            # Honors standard HTTP(S)_PROXY settings on the running computer/server.
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=180) as response:
                data = response.read(MAX_ASR_BODY + 1)
                if len(data) > MAX_ASR_BODY:
                    return self.send_json(502, {"error": "Upstream response too large"})
                self.send_response(response.status)
                self.send_header("Content-Type", response.headers.get("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as exc:
            self.send_json(exc.code if 400 <= exc.code <= 599 else 502, {"error": "Qwen Space rejected the request"})
        except (TimeoutError, urllib.error.URLError):
            self.send_json(502, {"error": "Cannot connect to Qwen Space; check server network/proxy"})
        except (ConnectionError, OSError):
            # The client may have cancelled; never log audio or Authorization.
            pass
        finally:
            ASR_SLOTS.release()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()


class Server(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


def open_browser_later(url: str) -> None:
    time.sleep(0.8)
    try:
        webbrowser.open(url, new=2)
    except Exception:
        pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="webCut static server")
    parser.add_argument("--host", default=os.environ.get("HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("PORT", DEFAULT_PORT)))
    parser.add_argument("--no-browser", action="store_true", help="do not open a local browser")
    parser.add_argument("--auto-port", action="store_true", help="try the next 10 ports if the requested port is busy")
    return parser.parse_args()


def bind_server(host: str, port: int, auto_port: bool):
    ports = range(port, port + 11) if auto_port else (port,)
    last_error: OSError | None = None

    for candidate in ports:
        try:
            return Server((host, candidate), Handler), candidate
        except OSError as exc:
            last_error = exc
            if exc.errno not in {errno.EADDRINUSE, 10048}:
                raise

    if last_error is not None:
        raise last_error
    raise OSError("No available port")


def main() -> int:
    args = parse_args()
    os.chdir(ROOT)

    public = args.host not in {"127.0.0.1", "localhost", "::1"}

    try:
        httpd, actual_port = bind_server(args.host, args.port, args.auto_port)
    except OSError as exc:
        print(f"Server failed: {exc}")
        if args.auto_port:
            print(f"Ports {args.port}-{args.port + 10} are unavailable.")
        else:
            print(f"Check whether port {args.port} is already in use or blocked by the firewall.")
        return 2

    local_url = f"http://127.0.0.1:{actual_port}/"
    display_url = f"http://{args.host}:{actual_port}/"

    print("=" * 52)
    print("webCut server")
    print("=" * 52)
    print(f"Folder : {ROOT}")
    print(f"Listen : {display_url}")
    if actual_port != args.port:
        print(f"Notice : port {args.port} was busy, switched to {actual_port}")
    if public:
        print(f"LAN/WAN: http://<server-ip>:{actual_port}/")
    else:
        print(f"Open   : {local_url}")
    print()
    print("The web server serves the editor and a fixed Qwen Space relay.")
    print("Media editing/export runs in the visitor's browser.")
    print("Only Qwen ASR sends extracted audio to the configured ASR API.")
    print("Press Ctrl+C to stop.")
    print()

    try:
        if not args.no_browser and not public:
            threading.Thread(target=open_browser_later, args=(local_url,), daemon=True).start()
        with httpd:
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nwebCut server stopped.")
        return 0
    except Exception as exc:
        print(f"Server failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
