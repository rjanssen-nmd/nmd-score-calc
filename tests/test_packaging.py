import os
import subprocess
import sys
import tempfile
from pathlib import Path


def test_wheel_install_imports_bundle(tmp_path):
    repo_root = Path(__file__).resolve().parents[1]
    wheel_dir = tmp_path / "wheelhouse"
    wheel_dir.mkdir()

    subprocess.run(
        [sys.executable, "-m", "pip", "wheel", ".", "--no-deps", "-w", str(wheel_dir)],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )

    wheel_files = sorted(wheel_dir.glob("nmd_score_calc-*.whl"))
    assert wheel_files, "expected a wheel to be built"

    venv_dir = tmp_path / "venv"
    subprocess.run(
        [sys.executable, "-m", "venv", str(venv_dir)],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )

    python_exe = venv_dir / ("Scripts/python.exe" if os.name == "nt" else "bin/python")

    subprocess.run(
        [str(python_exe), "-m", "pip", "install", "--no-deps", str(wheel_files[0])],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )

    result = subprocess.run(
        [str(python_exe), "-c", "import nmd_score_calc; print(nmd_score_calc.bridge._BUNDLE_PATH)"],
        cwd=repo_root,
        check=True,
        capture_output=True,
        text=True,
    )

    assert "bundle.js" in result.stdout
