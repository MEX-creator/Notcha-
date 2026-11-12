"""Run a batch of packet-tracer MCP tool calls in one server session.

Usage: python pt_batch.py steps.json [results.json]

steps.json: [{"label": "...", "tool": "pt_add_device", "args": {...}, "stop_on_error": true}, ...]
"""
import json
import sys

from pt_client import Client


def brief(value, limit=400):
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= limit else text[:limit] + "..."


def main():
    steps = json.load(open(sys.argv[1], encoding="utf-8"))
    out_path = sys.argv[2] if len(sys.argv) > 2 else None
    client = Client()
    client.initialize()
    results = []
    for i, step in enumerate(steps, 1):
        label = step.get("label") or step["tool"]
        try:
            res = client.call(step["tool"], step.get("args") or {}, timeout=step.get("timeout", 600))
        except Exception as exc:  # noqa: BLE001
            res = {"__exception__": str(exc)}
        results.append({"label": label, "tool": step["tool"], "result": res})
        print("[%d/%d] %s -> %s" % (i, len(steps), label, brief(res)))
        sys.stdout.flush()
        failed = bool(res.get("__exception__") or res.get("error")) if isinstance(res, dict) else False
        if failed:
            if step.get("stop_on_error", True):
                print("!! stopping on error")
                break
    if out_path:
        json.dump(results, open(out_path, "w", encoding="utf-8"), indent=1, ensure_ascii=False)
    return 0


if __name__ == "__main__":
    sys.exit(main())
