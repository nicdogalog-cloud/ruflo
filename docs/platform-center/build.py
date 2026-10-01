#!/usr/bin/env python3
"""Build Platform Center into one self-contained HTML file for the artifact.

Usage: python3 docs/platform-center/build.py [out.html]

Inlines styles.css and every <script src> from index.html, and turns each
"crease-cam/<name>.jpg" in crease-cam/photos.js into a data URI. The output
starts with <title>; the Artifact tool adds the document skeleton on publish.
"""
import base64
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent


def inline_photos(js: str) -> str:
    def rep(m):
        path = HERE / m.group(1)
        data = base64.b64encode(path.read_bytes()).decode()
        return f'"data:image/jpeg;base64,{data}"'
    return re.sub(r'"(crease-cam/[\w.-]+\.jpg)"', rep, js)


def build() -> str:
    src = (HERE / 'index.html').read_text()
    title = re.search(r'<title>.*?</title>', src).group(0)
    links = re.findall(r'<link rel="(?:preconnect|stylesheet)" href="https://fonts[^>]*>', src)
    body = re.search(r'<body>\n(.*?)<script', src, re.S).group(1)
    scripts = re.findall(r'<script src="([^"]+)"></script>', src)
    parts = [title, '<style>', (HERE / 'styles.css').read_text().rstrip('\n'), '</style>', *links, body.rstrip('\n')]
    for s in scripts:
        js = (HERE / s).read_text()
        if s == 'crease-cam/photos.js':
            js = inline_photos(js)
        assert '</script' not in js.lower(), s
        parts += ['<script>', js.rstrip('\n'), '</script>']
    return '\n'.join(parts) + '\n'


if __name__ == '__main__':
    out = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / 'dist' / 'platform-center.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(build())
    print(f'wrote {out} ({out.stat().st_size:,} bytes)')
