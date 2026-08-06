import os
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
BACKEND_ROOT = Path(os.environ.get("NMD_BPM_BACKEND_ROOT", "../nmd_bpm_backend")).resolve()
ENTRY = ROOT / "scripts" / "entry.mjs"
OUT = ROOT / "src" / "nmd_score_calc" / "bundle.js"


if not BACKEND_ROOT.exists():
    raise SystemExit(f"Backend root not found: {BACKEND_ROOT}")

subprocess.run(
    [
        "node",
        "--input-type=module",
        "-e",
        (
            "import { build } from 'esbuild';"
            "await build({ entryPoints: ['scripts/entry.mjs'], bundle: true, format: 'iife', globalName: 'NmdScoreCalc', outfile: 'src/nmd_score_calc/bundle.js', define: { 'process.env.NMD_BPM_BACKEND_ROOT': JSON.stringify(process.env.NMD_BPM_BACKEND_ROOT || '') } });"
        ),
    ],
    cwd=ROOT,
    check=True,
)

commit = subprocess.check_output(["git", "-C", str(BACKEND_ROOT), "rev-parse", "HEAD"], text=True).strip()
OUT.write_text(
    f"// Bundled from nmd_bpm_backend commit {commit}\n" + OUT.read_text(encoding="utf-8"),
    encoding="utf-8",
)
print(commit)
