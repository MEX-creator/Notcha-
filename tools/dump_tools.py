"""Dump the packet-tracer MCP tool list (name, description, input schema) to tools.json beside this script."""
import json
import os

from pt_client import Client

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "tools.json")

c = Client()
c.initialize()
r = c.rpc("tools/list", {}, timeout=180)
tools = r.get("result", {}).get("tools", [])
with open(OUT, "w", encoding="utf-8") as fh:
    json.dump(tools, fh, indent=1, ensure_ascii=False)
print("tools:", len(tools), "->", OUT)
