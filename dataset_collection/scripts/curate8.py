"""
Purpose:
    Review the adjudication queue eight images at a time, so a 74-image pass
    takes ten batches rather than seventy-four decisions.

    Most images in the queue are obvious at a glance — a porcelain vase, a
    notebook, a café table — and forcing them through a one-at-a-time flow wastes
    the reviewer's attention on cases that need none of it. A grid lets the eye
    triage in bulk and reserves deliberation for the genuinely ambiguous ones
    (fine-line black work, tattoo stencils, henna).

    Each tile shows the stored label and both model verdicts, with a red border
    when both models disagree with the label. Click a tile to cycle its decision,
    or use number keys. Decisions append to the same JSON file curate.py writes,
    so the two tools are interchangeable and a session can be resumed in either.

    Nothing is deleted or moved here — curate_apply.py enacts decisions against
    a copy, leaving the source tree untouched.

Dependencies:
    - stdlib only (http.server)
    - gold_adjudication_queue.json (from build_gold_split.py)

Usage:
    python curate8.py [--port 8090]
    then open http://localhost:8090/

Changes:
    2026-07-16: Initial.
"""

from __future__ import annotations

import argparse
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]
SHORT = {"real_tattoo": "real", "sticker_tattoo": "sticker",
         "pen_drawn": "pen", "not_tattoo": "none"}

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Curate — 8 at a time</title>
<style>
 :root{--bg:#0f1115;--fg:#e8eaed;--mut:#9aa0a6;--ac:#0F766E;--bad:#b91c1c;--warn:#b45309}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
 .wrap{max-width:1200px;margin:0 auto;padding:18px}
 h1{font-size:17px;margin:0 0 2px}
 .sub{color:var(--mut);font-size:12px;margin-bottom:12px}
 .bar{height:6px;background:#222734;border-radius:99px;overflow:hidden;margin:10px 0}
 .bar span{display:block;height:100%;background:var(--ac);transition:width .2s}
 .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
 .cell{background:#171a21;border:2px solid #262b36;border-radius:10px;overflow:hidden;cursor:pointer}
 .cell.flag{border-color:var(--bad)}
 .cell.done{border-color:var(--ac)}
 .cell img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:#000}
 .meta{padding:6px 8px;font-size:11px;color:var(--mut);line-height:1.35}
 .lab{color:var(--fg);font-weight:600;font-size:12px}
 .dec{padding:5px 8px;font-size:12px;font-weight:700;text-align:center}
 .dec.none{background:#222734;color:var(--mut)}
 .dec.set{background:var(--ac);color:#fff}
 .dec.del{background:var(--bad);color:#fff}
 .btns{display:flex;gap:8px;margin-top:14px;flex-wrap:wrap}
 button{background:#222734;color:var(--fg);border:1px solid #333a49;border-radius:8px;
        padding:9px 14px;font-size:14px;cursor:pointer}
 button:hover{border-color:var(--ac)}
 kbd{background:#222734;border:1px solid #333a49;border-radius:4px;padding:1px 5px;font-size:11px}
</style></head><body><div class="wrap">
<h1>Curate — 8 at a time</h1>
<div class="sub">Click a tile to cycle: keep &rarr; real &rarr; sticker &rarr; pen &rarr; none &rarr; DELETE.
 Red border = both models disagree with the stored label. <kbd>N</kbd> next batch.</div>
<div class="bar"><span id="bar" style="width:0"></span></div>
<div class="sub" id="stat"></div>
<div class="grid" id="grid"></div>
<div class="btns">
 <button onclick="prev()">&larr; previous</button>
 <button onclick="next()">next batch (N) &rarr;</button>
 <button onclick="allKeep()">mark all 8 as correct</button>
 <button onclick="allDel()">mark all 8 for deletion</button>
</div></div>
<script>
const CYCLE=['keep','real_tattoo','sticker_tattoo','pen_drawn','not_tattoo','delete'];
const SHORT={keep:'KEEP AS-IS',real_tattoo:'REAL',sticker_tattoo:'STICKER',
             pen_drawn:'PEN',not_tattoo:'NONE',delete:'DELETE'};
let q=[],dec={},page=0;
fetch('/queue').then(r=>r.json()).then(d=>{q=d.queue;dec=d.decisions||{};
  const done=Object.keys(dec).length; page=Math.floor(done/8); render();});
function render(){
 const g=document.getElementById('grid'); g.innerHTML='';
 const batch=q.slice(page*8,page*8+8);
 batch.forEach(r=>{
  const d=dec[r.path];
  const flag=(r.vit&&r.clip&&r.vit!==r.label&&r.clip!==r.label);
  const el=document.createElement('div');
  el.className='cell'+(flag?' flag':'')+(d?' done':'');
  el.onclick=()=>cycle(r.path);
  el.innerHTML=`<img src="/img?p=${encodeURIComponent(r.path)}">
   <div class="meta"><div class="lab">${r.label}</div>
   model1: ${r.vit||'?'} &middot; model2: ${r.clip||'?'}</div>
   <div class="dec ${!d?'none':(d==='delete'?'del':'set')}">${d?SHORT[d]:'— click —'}</div>`;
  g.appendChild(el);
 });
 const n=Object.keys(dec).length;
 document.getElementById('bar').style.width=(100*n/q.length)+'%';
 document.getElementById('stat').textContent=
   `batch ${page+1} of ${Math.ceil(q.length/8)} · ${n} of ${q.length} decided`;
}
function cycle(p){const i=CYCLE.indexOf(dec[p]||'keep');
 const nx=CYCLE[(i+1)%CYCLE.length]; dec[p]=nx; save(p,nx); render();}
function save(p,v){fetch('/decide',{method:'POST',body:JSON.stringify({path:p,decision:v})});}
function setAll(v){q.slice(page*8,page*8+8).forEach(r=>{dec[r.path]=v;save(r.path,v)});render();}
function allKeep(){setAll('keep')} function allDel(){setAll('delete')}
function next(){if((page+1)*8<q.length){page++;render()}}
function prev(){if(page>0){page--;render()}}
document.addEventListener('keydown',e=>{
 if(e.key==='n'||e.key==='N'||e.key==='ArrowRight')next();
 else if(e.key==='p'||e.key==='ArrowLeft')prev();});
</script></body></html>"""


def make_handler(queue: list, decisions_path: Path):
    decisions: dict = {}
    if decisions_path.exists():
        decisions = json.loads(decisions_path.read_text())

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, body, ctype="application/json"):
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            u = urlparse(self.path)
            if u.path == "/":
                return self._send(200, PAGE.encode(), "text/html; charset=utf-8")
            if u.path == "/queue":
                return self._send(200, json.dumps(
                    {"queue": queue, "decisions": decisions}).encode())
            if u.path == "/img":
                rel = parse_qs(u.query).get("p", [""])[0]
                # Confine reads to data/ — the path comes from the browser.
                target = (DATA / rel).resolve()
                if not str(target).startswith(str(DATA.resolve())) or not target.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._send(200, target.read_bytes(), "image/png")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n) or b"{}")
            if d.get("path"):
                decisions[d["path"]] = d.get("decision")
                decisions_path.write_text(json.dumps(decisions, indent=1))
            return self._send(200, b'{"ok":true}')

    return H


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--queue", default=str(BASE / "gold_adjudication_queue.json"))
    ap.add_argument("--decisions", default=str(BASE / "curation_decisions.json"))
    args = ap.parse_args()

    queue = json.loads(Path(args.queue).read_text())
    handler = make_handler(queue, Path(args.decisions))
    print(f"{len(queue)} images, 8 per screen = {-(-len(queue) // 8)} batches")
    print(f"Open http://localhost:{args.port}/   decisions -> {args.decisions}")
    HTTPServer(("localhost", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
