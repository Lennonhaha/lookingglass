"""Positive-control test: VOX-like key MUST be MinRank-recoverable.

SPDX-License-Identifier: GPL-3.0-only
Run:  python test_vox.py
"""
import time
import galois
from minrank_solver import run_positive_control

if __name__ == "__main__":
    GF = galois.GF(251)
    t0 = time.time()
    r = run_positive_control(GF, n=10, o=4, kernel_dim=3)
    wall = time.time() - t0
    print("[test_vox] VOX-like positive control")
    for k, v in r.items():
        print(f"  {k}: {v}")
    ok = r["recovered"] and r["found_kernel_dim"] >= r["planted_kernel_dim"]
    print(f"  RESULT: {'PASS' if ok else 'FAIL'} (wall {wall:.3f}s)")
    raise SystemExit(0 if ok else 1)
