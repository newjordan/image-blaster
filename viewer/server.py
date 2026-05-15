#!/usr/bin/env python3
"""3D Model Viewer Server — serves the viewer UI and model files over HTTP."""
import http.server
import os
import socket
import sys
from pathlib import Path
from urllib.parse import unquote

VIEWER_DIR = Path.home() / '.hermes' / '3d-viewer'
MODEL_DIRS = [
    Path('/tmp/trellis-output'),
    Path('/tmp/trellis-test'),
]
PORT = 8080

class ViewerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(VIEWER_DIR), **kwargs)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def do_GET(self):
        path = unquote(self.path)

        # Serve model files from model directories
        if path.startswith('/models/'):
            rel = path[len('/models/'):]
            if rel:
                for md in MODEL_DIRS:
                    fp = md / rel
                    if fp.exists() and fp.is_file():
                        self.send_response(200)
                        ct = 'text/plain'
                        if fp.suffix == '.json':
                            ct = 'application/json'
                        self.send_header('Content-Type', ct)
                        self.end_headers()
                        with open(fp, 'rb') as f:
                            self.wfile.write(f.read())
                        return

            # Directory listing
            all_files = []
            for md in MODEL_DIRS:
                if md.exists():
                    for f in sorted(md.iterdir()):
                        if f.is_file():
                            all_files.append(f)

            if all_files:
                self.send_response(200)
                self.send_header('Content-Type', 'text/html')
                self.end_headers()
                html = '<html><body><h2>Models</h2><ul>\n'
                seen = set()
                for f in all_files:
                    if f.name not in seen:
                        seen.add(f.name)
                        size = f.stat().st_size
                        if size > 1_000_000:
                            size_str = f'{size/1_000_000:.1f}M'
                        elif size > 1_000:
                            size_str = f'{size/1_000:.1f}K'
                        else:
                            size_str = f'{size}B'
                        html += f'<li><a href="/models/{f.name}">{f.name}</a> {size_str}</li>\n'
                html += '</ul></body></html>'
                self.wfile.write(html.encode())
            else:
                self.send_error(404, 'No models found')
            return

        # Serve viewer UI
        if path == '/' or path == '':
            path = '/index.html'
        return super().do_GET()

    def log_message(self, format, *args):
        if args and '/models/' in str(args[0]):
            return
        super().log_message(format, *args)


if __name__ == '__main__':
    host = '0.0.0.0'
    print(f'Image Blaster 3D Viewer')
    print(f'   Local:  http://localhost:{PORT}')

    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        lan_ip = s.getsockname()[0]
        s.close()
        print(f'   LAN:    http://{lan_ip}:{PORT}')
    except Exception:
        pass

    print(f'   Models: {", ".join(str(d) for d in MODEL_DIRS)}')
    print()

    server = http.server.HTTPServer((host, PORT), ViewerHandler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
        server.shutdown()
