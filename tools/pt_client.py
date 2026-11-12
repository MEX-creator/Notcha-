"""Tiny stdio MCP client for packet-tracer-mcp.

Usage:
  python pt_client.py list
  python pt_client.py schema <tool>
  python pt_client.py call <tool> '<json-args>'
"""
import json
import os
import queue
import subprocess
import sys
import threading
import time

CMD = [
    r"C:\Users\Dell\.local\bin\uvx.exe",
    "--from",
    "packet-tracer-mcp[ui]",
    "packet-tracer-mcp",
    "--stdio",
]
ENV = dict(os.environ)
ENV["UV_PYTHON"] = r"C:\Users\Dell\AppData\Local\Programs\Python\Python313\python.exe"
ENV["UV_NO_MANAGED_PYTHON"] = "1"


class Client:
    def __init__(self):
        self.proc = subprocess.Popen(
            CMD,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            env=ENV,
            text=True,
            encoding="utf-8",
            bufsize=1,
        )
        self.q = queue.Queue()
        threading.Thread(target=self._reader, daemon=True).start()
        self.mid = 0

    def _reader(self):
        for line in self.proc.stdout:
            line = line.strip()
            if line.startswith("{"):
                try:
                    self.q.put(json.loads(line))
                except ValueError:
                    pass

    def _send(self, obj):
        self.proc.stdin.write(json.dumps(obj) + "\n")
        self.proc.stdin.flush()

    def _await(self, mid, timeout):
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                msg = self.q.get(timeout=max(0.05, deadline - time.time()))
            except queue.Empty:
                break
            if msg.get("id") == mid:
                return msg
        raise TimeoutError("no response for id %s after %ss" % (mid, timeout))

    def initialize(self, timeout=90):
        self.mid += 1
        self._send(
            {
                "jsonrpc": "2.0",
                "id": self.mid,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {},
                    "clientInfo": {"name": "buffy", "version": "1.0"},
                },
            }
        )
        self._await(self.mid, timeout)
        self._send({"jsonrpc": "2.0", "method": "notifications/initialized"})

    def rpc(self, method, params=None, timeout=300):
        self.mid += 1
        self._send({"jsonrpc": "2.0", "id": self.mid, "method": method, "params": params or {}})
        return self._await(self.mid, timeout)

    def call(self, name, args=None, timeout=900):
        r = self.rpc("tools/call", {"name": name, "arguments": args or {}}, timeout)
        if "error" in r:
            return {"error": r["error"]}
        res = r.get("result", {})
        text = "".join(c.get("text", "") for c in res.get("content", []) if c.get("type") == "text")
        if res.get("structuredContent") is not None:
            return res["structuredContent"]
        try:
            return json.loads(text)
        except ValueError:
            return text


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        return 1
    c = Client()
    c.initialize()
    cmd = sys.argv[1]
    if cmd == "list":
        r = c.rpc("tools/list", {}, timeout=120)
        for t in r.get("result", {}).get("tools", []):
            print("%-28s %s" % (t["name"], (t.get("description") or "")[:110].replace("\n", " ")))
    elif cmd == "schema":
        r = c.rpc("tools/list", {}, timeout=120)
        for t in r.get("result", {}).get("tools", []):
            if t["name"] == sys.argv[2]:
                print(json.dumps(t.get("inputSchema", {}), indent=1))
                break
    elif cmd == "call":
        args = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}
        print(json.dumps(c.call(sys.argv[2], args), indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
