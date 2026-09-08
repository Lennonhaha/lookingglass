"""Negative-control test: random (unstructured) matrices MUST NOT yield a
common kernel -- proving the MinRank test is meaningful, not trivially passing.

SPDX-License-Identifier: GPL-3.0-only
Run:  python test_uov.py

NOTE: this is labeled "random-like", NOT "UOV". Classic UOV's oil space IS a
common kernel (that is exactly what Kipnis-Shamir recovers), so UOV isMinRank-
vulnerable in principle. The negative control here is *unstructured* random
maps with no planted structure. See minrank_solver.py header for the correction.
"""
import time
import galois
from minrank_solver import run_negative_control

if __name__ == "__main__":
    GF = galois.GF(251)
    t0 = time.time()
    r = run_negative_control(GF, n=10, o=4)
    wall = time.time() - t0
    print("[test_uov] random-like negative control")
    for k, v in r.items():
        print(f"  {k}: {v}")
    ok = (not r["recovered"]) and r["found_kernel_dim"] == 0
    print(f"  RESULT: {'PASS' if ok else 'FAIL'} (wall {wall:.3f}s)")
    raise SystemExit(0 if ok else 1)
