#!/usr/bin/env python3
"""Local dev server for the site — like `python3 -m http.server`, but it never
lets the browser cache anything.

Why this exists: the stock http.server sends Last-Modified and answers repeat
requests with 304 Not Modified, so the browser keeps serving the copy it already
has. During development that means an edit to styles.css or script.js appears to
do nothing, and the only way to see it is to bump the ?v=NN cache-busting query
in every HTML file.

That query string is a *deploy* mechanism — it exists so returning visitors get
fresh assets after a release. Using it to see your own edits inflates it by
dozens of versions per session and, worse, produces genuinely confusing bugs
where the file on disk and the code running in the browser disagree.

With no-store the browser doesn't keep a copy at all, so it never sends
If-Modified-Since and never gets a 304. A plain reload is enough, and ?v=NN only
moves when you ship.

Started by the Browser pane via .claude/launch.json; port defaults to 8000.
"""

import http.server
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def send_head(self):
        # SimpleHTTPRequestHandler answers 304 Not Modified from
        # If-Modified-Since inside send_head, before any header we add can
        # matter. Dropping the request header removes that path entirely, so a
        # stale copy can never be revalidated into service.
        del self.headers['If-Modified-Since']
        del self.headers['If-None-Match']
        return super().send_head()

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()


if __name__ == '__main__':
    http.server.test(HandlerClass=NoCacheHandler, port=PORT, bind='127.0.0.1')
