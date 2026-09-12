from __future__ import annotations

import argparse
import http.server
import os
import socketserver
import threading
import time
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DEFAULT_PORT = 18080


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

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
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    os.chdir(ROOT)

    public = args.host not in {"127.0.0.1", "localhost", "::1"}
    local_url = f"http://127.0.0.1:{args.port}/"
    display_url = f"http://{args.host}:{args.port}/"

    print("=" * 52)
    print("webCut server")
    print("=" * 52)
    print(f"Folder : {ROOT}")
    print(f"Listen : {display_url}")
    if public:
        print(f"LAN/WAN: http://<server-ip>:{args.port}/")
    else:
        print(f"Open   : {local_url}")
    print()
    print("The web server only serves HTML/CSS/JS.")
    print("Media editing/export runs in the visitor's browser.")
    print("Only Qwen ASR sends extracted audio to the configured ASR API.")
    print("Press Ctrl+C to stop.")
    print()

    try:
        with Server((args.host, args.port), Handler) as httpd:
            if not args.no_browser and not public:
                threading.Thread(target=open_browser_later, args=(local_url,), daemon=True).start()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nwebCut server stopped.")
        return 0
    except OSError as exc:
        print(f"Server failed: {exc}")
        print(f"Check whether port {args.port} is already in use or blocked by the firewall.")
        return 2
    except Exception as exc:
        print(f"Server failed: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
