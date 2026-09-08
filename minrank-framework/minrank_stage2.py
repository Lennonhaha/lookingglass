"""MinRank stage-2 frontier models (SNOVA / MAYO) -- rank-signature skeletons.

SPDX-License-Identifier: GPL-3.0-only

HONESTY / SCOPE NOTE
--------------------
This does NOT implement SNOVA or MAYO as signature schemes. It models only the
property MinRank attacks exploit for each: the *rank defect* (planted low-rank
structure) of their public maps. Each scheme is reduced to a (n, o, rank_defect)
triple and fed through the SAME common-kernel MinRank solver from
minrank_solver.py, to show:

  * schemes with a real planted rank defect  -> MinRank finds a common kernel
  * "hardened" variants (smaller / no defect)-> MinRank yields nothing

These are STRUCTURAL skeletons for methodology demonstration. They are NOT
faithful SNOVA/MAYO parameter sets, and produce NO cryptographic attack numbers.
The bibliographic claims about SNOVA/MAYO (PQCrypto 2024, CRYPTO 2026, etc.)
were NOT independently verified this session; treat them as pointers, not facts.

References (for the rank-defect modeling intuition, not verbatim attacks):
  SNOVA: a UOV variant over a matrix-ring / GL(n) extension; the public map keeps
         a Vinegar-space structure, hence a recoverable (low-rank) kernel.
  MAYO: a UOV variant with an OV*OV-composition; the "oil" space is enlarged and
        the rank defect is *smaller* than full UOV, which is exactly why MAYO is
        more MinRank-resistant than plain UOV.
"""

from __future__ import annotations
import galois
from minrank_solver import build_vox_like_key, build_random_like_key, minrank_common_kernel


def model_snova_like(GF, n=12, o=4, kernel_dim=3):
    """SNOVA modeled as a UOV-family scheme with a recoverable kernel (rank defect
    = kernel_dim). Expects MinRank to RECOVER it (positive / vulnerable)."""
    M, K = build_vox_like_key(GF, n, o, kernel_dim)
    dim, _ = minrank_common_kernel(M, GF)
    return {"scheme": "SNOVA-like (rank-defect skeleton)", "n": n, "o": o,
            "planted_kernel_dim": kernel_dim, "found_kernel_dim": dim,
            "recovered": dim >= kernel_dim}


def model_mayo_like(GF, n=12, o=4, kernel_dim=1):
    """MAYO modeled with a SMALL rank defect (more MinRank-resistant than UOV).
    With tiny toy params the solver may still catch a dim-1 defect; at real
    scale MAYO's defect is what makes naive MinRank infeasible. We report the
    found dim honestly without overclaiming."""
    M, K = build_vox_like_key(GF, n, o, kernel_dim)
    dim, _ = minrank_common_kernel(M, GF)
    return {"scheme": "MAYO-like (small-defect skeleton)", "n": n, "o": o,
            "planted_kernel_dim": kernel_dim, "found_kernel_dim": dim,
            "recovered": dim >= kernel_dim}


def model_hardened(GF, n=12, o=4):
    """Unstructured (no planted defect) -- the negative control reference.
    MinRank must find nothing."""
    M = build_random_like_key(GF, n, o)
    dim, _ = minrank_common_kernel(M, GF)
    return {"scheme": "random-like (no defect)", "n": n, "o": o,
            "planted_kernel_dim": 0, "found_kernel_dim": dim,
            "recovered": dim >= 1}


if __name__ == "__main__":
    GF = galois.GF(251)
    print("=== MinRank stage-2: frontier rank-signature skeletons ===")
    for fn in (model_snova_like, model_mayo_like, model_hardened):
        r = fn(GF)
        print("\n", r["scheme"])
        for k, v in r.items():
            if k != "scheme":
                print(f"  {k}: {v}")
    print("\nNOTE: structural skeletons only. No cryptographic attack numbers.")
    print("MAYO's small defect is what buys MinRank-resistance at real scale;")
    print("the toy dim-1 defect above is caught only because params are tiny.")
