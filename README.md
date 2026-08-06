# nmd-score-calc

Python bridge around the shared NMD BPM frontend calculator logic.

This package bundles the current frontend calculator implementation from the sibling repository [nmd_bpm_backend](https://github.com/rjanssen-nmd/nmd-bpm-backend) and exposes it through a small Python API. The generated bundle is pinned to the frontend commit `9b865cd404edb8bcd48833ab19cd519c64b096c7` and should be regenerated manually when upstream changes are needed.

## Development

```bash
pip install -e ".[test]"
pytest
```
