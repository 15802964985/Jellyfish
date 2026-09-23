"""Serve the checked-out schema without lifespan, database writes or task dispatch."""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from app.main import app


class SchemaHandler(BaseHTTPRequestHandler):
    """Expose only the generated schema on an isolated loopback port."""

    def do_GET(self):
        """Return the schema without starting application services."""
        if self.path != '/openapi.json':
            self.send_error(404)
            return
        body = json.dumps(app.openapi()).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == '__main__':
    HTTPServer(('127.0.0.1', 18081), SchemaHandler).serve_forever()
