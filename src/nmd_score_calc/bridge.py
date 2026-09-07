import json
import os
import warnings
from pathlib import Path
from typing import Any

with warnings.catch_warnings():
    # py_mini_racer defines a ctypes.Structure (`ArrayBufferByte`) that sets
    # `_pack_` without `_layout_`. Python 3.14 emits a DeprecationWarning for
    # that at import time. The layout it falls back to is the one it wants and
    # the module is third-party, so scope-silence just this import rather than
    # leaking the warning into every consumer's test output.
    warnings.filterwarnings(
        "ignore",
        message=r"Due to 'pack', the 'ArrayBufferByte' Structure",
        category=DeprecationWarning,
    )
    from py_mini_racer import MiniRacer


_BUNDLE_PATH = Path(__file__).resolve().parent / "bundle.js"
_BACKEND_ROOT = os.environ.get("NMD_BPM_BACKEND_ROOT")


class _BridgeRuntime:
    def __init__(self) -> None:
        self._ctx = MiniRacer()
        self._load_bundle()

    def _load_bundle(self) -> None:
        bundle_path = _BUNDLE_PATH
        if not bundle_path.exists():
            raise FileNotFoundError(f"Bundle not found at {bundle_path}")

        source = bundle_path.read_text(encoding="utf-8")
        self._ctx.eval("""
            if (typeof console === 'undefined') {
                console = { log: function() {}, warn: function() {}, error: function() {} };
            }
            if (typeof crypto === 'undefined') {
                crypto = {};
            }
            if (typeof crypto.randomUUID !== 'function') {
                crypto.randomUUID = function() {
                    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                        const r = Math.floor(Math.random() * 16);
                        const v = c === 'x' ? r : (r & 0x3 | 0x8);
                        return v.toString(16);
                    });
                };
            }
        """)
        self._ctx.eval(source)

    def call(self, name: str, *args: Any) -> Any:
        payload = json.dumps(args)
        result = self._ctx.eval(
            f"JSON.stringify(globalThis.NmdScoreCalc.{name}.apply(globalThis.NmdScoreCalc, JSON.parse({json.dumps(payload)})))"
        )
        return json.loads(result)


_RUNTIME = _BridgeRuntime()


def _call_js(name: str, *args: Any) -> Any:
    return _RUNTIME.call(name, *args)


def calc_scale_factor(profile: dict, schaling_profiles: list) -> float:
    return _call_js("calcScaleFactor", profile, schaling_profiles)


def build_mpg_kern(f_i: float, f_r: float, onv_herg: bool, stages: list[str]) -> list[list[float]]:
    return _call_js("buildMPGKern", f_i, f_r, "Ja" if onv_herg else "Nee", stages)


def reconcile_scaling(supplied_scaling: list[dict], declaration: dict, nmd_id: str) -> dict:
    return _call_js("reconcileScaling", supplied_scaling, declaration, nmd_id)


def calculate_mpg(project: dict, producten: list[dict], assessment_strategy: dict, impact_indicators: list[dict]) -> dict:
    return _call_js(
        "calculateMPG",
        {
            "project": project,
            "producten": producten,
            "assessmentStrategy": assessment_strategy,
            "impactIndicators": impact_indicators,
        },
    )
