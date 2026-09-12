from __future__ import annotations

import http.server
import os
import socket
import socketserver
import sys
import threading
import time
import webbrowser
from pathlib import Path

HOST = "127.0.0.1"
PORT = 18080
ROOT = Path(__file__).resolve().parent


class Handler(http.server.SimpleHTTPRequestHandler):
    # Serve files from the repository directory regardless of the current shell path.
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        # Helpful MIME and isolation headers for modern browser APIs / wasm workers.
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


def port_is_free(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        return s.connect_ex((host, port)) != 0


def open_browser_later(url: str):
    time.sleep(0.8)
    try:
        webbrowser.open(url, new=2)
    except Exception:
        pass


def main() -> int:
    os.chdir(ROOT)

    if not port_is_free(HOST, PORT):
        print(f"Port {PORT} is already in use.")
        print(f"Try opening http://{HOST}:{PORT}/ in your browser first.")
        print("If that page is not webCut, close the program using the port and run this again.")
        input("Press Enter to close...")
        return 2

    url = f"http://{HOST}:{PORT}/"
    print("=" * 46)
    print("webCut local server")
    print("=" * 46)
    print(f"Folder : {ROOT}")
    print(f"Address: {url}")
    print()
    print("Keep this window open while using webCut.")
    print("Video/audio stays local in your browser.")
    print("Press Ctrl+C to stop the server.")
    print()

    threading.Thread(target=open_browser_later, args=(url,), daemon=True).start()

    try:
        with socketserver.ThreadingTCPServer((HOST, PORT), Handler) as httpd:
            httpd.daemon_threads = True
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nwebCut server stopped.")
        return 0
    except Exception as exc:
        print(f"\nServer failed: {exc}")
        input("Press Enter to close...")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
