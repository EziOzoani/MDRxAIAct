"""
Purpose:
    Serve a keyboard-driven review UI over the curation manifest so 1,600
    training images can be triaged in one sitting.

    Manual curation is the highest-certainty accuracy gain available for this
    classifier. Five modelling hypotheses were tested on GPU and refuted
    (strong-model swap, broken-"none", train/serve distribution shift, CLIP
    features, ROI multi-crop); meanwhile opening three image files found a
    porcelain vase and a bare torso sitting in pen_drawn/. The data is the
    problem, so the tool aims a human at it as efficiently as possible.

    Most-suspicious images come first (both models disagreeing with the stored
    label), so the worst offenders are handled in the first few minutes and the
    long tail of correct labels can be abandoned whenever time runs out.

    Nothing is deleted or moved here. Decisions are appended to a JSON file;
    curate_apply.py enacts them, so a misclick is never destructive and the
    review is resumable.

Dependencies:
    - stdlib only (http.server) — no extra installs on the demo box
    - curation_manifest.json (from curate_scan.py)
    - dataset_collection/data/{variant}/{class}/*.png

Usage:
    python curate.py [--port 8090] [--manifest curation_manifest.json]
    then open http://localhost:8090/

Keys:
    1-4  relabel to real / sticker / pen / none     k  keep as-is
    d    mark for deletion (not in any class)       u  undo last
    ->   skip without deciding

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
CLASSES = ["real_tattoo", "sticker_tattoo", "pen_drawn", "not_tattoo"]

PAGE = """<!doctype html><html><head><meta charset="utf-8"><title>Curate training data</title>
<style>
 :root{--bg:#0f1115;--fg:#e8eaed;--mut:#9aa0a6;--ac:#0F766E;--warn:#b45309;--bad:#b91c1c}
 *{box-sizing:border-box}
 body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,sans-serif}
 .wrap{max-width:1000px;margin:0 auto;padding:20px}
 h1{font-size:18px;margin:0 0 4px}
 .sub{color:var(--mut);font-size:13px;margin-bottom:16px}
 .card{background:#171a21;border:1px solid #262b36;border-radius:12px;padding:16px;display:grid;
       grid-template-columns:340px 1fr;gap:20px}
 img{width:100%;border-radius:8px;background:#000}
 .meta div{margin-bottom:10px}
 .k{color:var(--mut);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
 .v{font-size:17px;font-weight:600}
 .flag{color:var(--bad);font-weight:700}
 .ok{color:var(--ac)}
 .btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
 button{background:#222734;color:var(--fg);border:1px solid #333a49;border-radius:8px;
        padding:9px 12px;font-size:14px;cursor:pointer}
 button:hover{border-color:var(--ac)}
 button.del{border-color:var(--bad)}
 .bar{height:6px;background:#222734;border-radius:99px;overflow:hidden;margin:14px 0}
 .bar span{display:block;height:100%;background:var(--ac)}
 .done{color:var(--mut);font-size:13px}
 kbd{background:#222734;border:1px solid #333a49;border-radius:4px;padding:1px 5px;font-size:12px}
</style></head><body><div class="wrap">
<h1>Curate training data</h1>
<div class="sub">Most-suspicious first. <kbd>1</kbd>real <kbd>2</kbd>sticker <kbd>3</kbd>pen
 <kbd>4</kbd>none <kbd>k</kbd>keep <kbd>d</kbd>delete <kbd>u</kbd>undo <kbd>&rarr;</kbd>skip</div>
<div class="bar"><span id="bar" style="width:0"></span></div>
<div class="done" id="done"></div>
<div class="card">
 <div><img id="img" alt=""></div>
 <div class="meta">
  <div><div class="k">stored label</div><div class="v" id="label"></div></div>
  <div><div class="k">fine-tuned model says</div><div class="v" id="vit"></div></div>
  <div><div class="k">CLIP zero-shot says</div><div class="v" id="clip"></div></div>
  <div><div class="k">file</div><div id="path" style="font-size:12px;color:var(--mut)"></div></div>
  <div class="btns">
   <button onclick="decide('real_tattoo')">1 real</button>
   <button onclick="decide('sticker_tattoo')">2 sticker</button>
   <button onclick="decide('pen_drawn')">3 pen</button>
   <button onclick="decide('not_tattoo')">4 none</button>
   <button onclick="decide('keep')">k keep</button>
   <button class="del" onclick="decide('delete')">d delete</button>
   <button onclick="skip()">&rarr; skip</button>
   <button onclick="undo()">u undo</button>
  </div>
 </div>
</div></div>
<script>
let recs=[],i=0,decided={},order=[];
fetch('/manifest').then(r=>r.json()).then(d=>{recs=d.records;decided=d.decisions||{};
  i=recs.findIndex(r=>!(r.path in decided)); if(i<0)i=0; render();});
function render(){
 if(i>=recs.length){document.getElementById('img').src='';
   document.getElementById('label').textContent='All done \\u2014 run curate_apply.py';return}
 const r=recs[i];
 document.getElementById('img').src='/img?p='+encodeURIComponent(r.path);
 const dis=(r.vit!==r.label)&&(r.clip!==r.label);
 document.getElementById('label').innerHTML=r.label+(dis?' <span class="flag">\\u2190 both models disagree</span>':'');
 document.getElementById('vit').innerHTML=(r.vit===r.label?'<span class="ok">':'<span class="flag">')+r.vit+'</span> '+r.vit_conf;
 document.getElementById('clip').innerHTML=(r.clip===r.label?'<span class="ok">':'<span class="flag">')+r.clip+'</span> '+r.clip_conf;
 document.getElementById('path').textContent=r.path;
 const n=Object.keys(decided).length;
 document.getElementById('bar').style.width=(100*n/recs.length)+'%';
 document.getElementById('done').textContent=n+' of '+recs.length+' decided \\u00b7 image '+(i+1);
}
function decide(v){const r=recs[i];decided[r.path]=v;order.push(r.path);
 fetch('/decide',{method:'POST',body:JSON.stringify({path:r.path,decision:v})});i++;render()}
function skip(){i++;render()}
function undo(){const p=order.pop();if(!p)return;delete decided[p];
 fetch('/decide',{method:'POST',body:JSON.stringify({path:p,decision:null})});
 i=recs.findIndex(r=>r.path===p);render()}
document.addEventListener('keydown',e=>{const m={'1':'real_tattoo','2':'sticker_tattoo',
 '3':'pen_drawn','4':'not_tattoo','k':'keep','d':'delete'};
 if(m[e.key])decide(m[e.key]);else if(e.key==='ArrowRight')skip();else if(e.key==='u')undo();});
</script></body></html>"""


def make_handler(manifest: dict, variant: str, decisions_path: Path):
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
            if u.path == "/manifest":
                payload = {"records": manifest["records"], "decisions": decisions}
                return self._send(200, json.dumps(payload).encode())
            if u.path == "/img":
                rel = parse_qs(u.query).get("p", [""])[0]
                # Confine reads to the variant's data dir — the browser supplies
                # this path, so a traversal attempt must not escape it.
                target = (BASE / "data" / variant / rel).resolve()
                root = (BASE / "data" / variant).resolve()
                if not str(target).startswith(str(root)) or not target.exists():
                    return self._send(404, b"not found", "text/plain")
                return self._send(200, target.read_bytes(), "image/png")
            return self._send(404, b"not found", "text/plain")

        def do_POST(self):
            n = int(self.headers.get("Content-Length", 0))
            d = json.loads(self.rfile.read(n) or b"{}")
            p, v = d.get("path"), d.get("decision")
            if p:
                if v is None:
                    decisions.pop(p, None)
                else:
                    decisions[p] = v
                decisions_path.write_text(json.dumps(decisions, indent=1))
            return self._send(200, b'{"ok":true}')

    return H


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8090)
    ap.add_argument("--manifest", default=str(BASE / "curation_manifest.json"))
    ap.add_argument("--decisions", default=str(BASE / "curation_decisions.json"))
    args = ap.parse_args()

    manifest = json.loads(Path(args.manifest).read_text())
    handler = make_handler(manifest, manifest.get("variant", "balanced"), Path(args.decisions))
    print(f"Curating {manifest['total']} images ({manifest.get('both_models_disagree', '?')} "
          f"flagged by both models)")
    print(f"Open http://localhost:{args.port}/   — decisions saved to {args.decisions}")
    HTTPServer(("localhost", args.port), handler).serve_forever()


if __name__ == "__main__":
    main()
