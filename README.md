# nmd-score-calc

Python bridge around the shared NMD BPM frontend calculator logic.

This package bundles the current frontend calculator implementation from the sibling repository [nmd_bpm_backend](https://github.com/rjanssen-nmd/nmd-bpm-backend) and exposes it through a small Python API. The generated bundle is pinned to the frontend commit `1d7cc3eec585091c1d6b739e283d570e4851415d` and should be regenerated manually (`python scripts/bundle_js.py`) when upstream changes are needed.

The package now includes the bundled JavaScript file in installed wheels so `pip install` works outside the development checkout.

## What the bundle contains

`scripts/entry.mjs` imports the MPG maths straight from `nmd_bpm_backend`'s
calculation modules — `computeReplacementFactors` (f_i/f_r), `buildScaledProductMatrix`
(scaling, aantal, categorie-3 opslag), `buildMPGKern` (the MPG kernel), and
`getWeights`/`applyWeights` (weegset weighting) — so the numbers can't drift from
the source app. Only the thin orchestration loop is re-implemented locally, so the
bridge can keep `calculateMPG` synchronous and expose two extra outputs that
upstream keeps as function-locals:

- `result.mkiUnweightedMatrix` — the summed indicator × 13-module matrix **before**
  weegset weighting.
- `result.productRows[i].rawMatrix` — each product's post-kernel matrix **before**
  the `* weights[i].weight` step.

Both let a consumer read an indicator whose weegset weight is 0 (e.g.
"klimaatverandering - totaal") without dividing by that zero weight.

## Development

```bash
pip install -e ".[test]"
pytest
```

## Test results

Verified locally with:

```bash
pytest -q
```

Result:

```text
11 passed
```
