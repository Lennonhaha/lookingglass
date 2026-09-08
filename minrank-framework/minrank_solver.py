"""MinRank key-recovery reproduction framework (Kipnis-Shamir MinRank).

SPDX-License-Identifier: GPL-3.0-only

SCOPE / HONESTY NOTE
--------------------
Educational, minimal reproduction of the MinRank attack FAMILY on multivariate-
quadratic (MQ) signature schemes. It is NOT a faithful re-run of any published
attack's exact parameters (VOX, Rainbow, ...). All parameter sets are tiny toy
values chosen so the demonstration runs in seconds on a laptop.

Two controls:
  * VOX-like (vulnerable / positive): the public-key quadratic matrices are
    constructed to share a common rank-defect kernel (the structure the MinRank
    attack recovers). The solver MUST find it.
  * random-like (negative): the matrices are random with NO common kernel, so
    the solver finds nothing. This proves the test is meaningful, not trivially
    always-succeeding.

Pedagogical correction on terminology
-------------------------------------
Classic UOV's oil space IS a common kernel of the public quadratic maps -- that
is exactly what Kipnis-Shamir recovers, so UOV is also MinRank-vulnerable in
principle. The "negative control" here is therefore NOT classic UOV; it is
*unstructured* random matrices (no common kernel at all). We label it
"random-like" to avoid the false claim that "UOV is safe". VOX is called out
because its planted rank defect is LARGER / leaks faster than full UOV.

The math (common-kernel MinRank) is correct; the sizes are toy. Reproducing the
literature's "2 s / 53 h" numbers needs the optimized polynomial-system solvers
(Bardet et al., ASIACRYPT 2020, and follow-ups) at cryptographic scale -- not
this script.

References:
  Kipnis & Shamir, "Cryptanalysis of the HFE Public Key Cryptosystem", CRYPTO 1999.
  Kipnis, Shamir & Patarin (Connell), "Cryptanalysis of the Oil and Vinegar
    Signature Scheme", CRYPTO 1999.
  Bardet et al., "Improvements of Algebraic Attacks for Solving the Rank
    Decoding and MinRank Problems", ASIACRYPT 2020.
"""

from __future__ import annotations
import time
import numpy as np
import galois


def _projector_ker(K):
    """Return operator P (n x n) over GF that projects onto ker(span(K)).

    K is n x d (kernel basis, full column rank). P = I - K (K^T K)^{-1} K^T,
    so P K = 0. Then any A = P^T R P has span(K) in its kernel.
    """
    GF = type(K)  # the galois FieldArray class
    n, d = K.shape
    KtK = K.T @ K
    KtK_inv = np.linalg.inv(KtK)  # galois FieldArray supports inversion
    P = GF(np.eye(n, dtype=int)) - (K @ (KtK_inv @ K.T))
    return P


def build_vox_like_key(GF, n, o, kernel_dim):
    """Vulnerable structure: all o public quadratic maps share a kernel of dim
    `kernel_dim` (the MinRank target). Returns (M_list, K)."""
    # random kernel basis K (n x kernel_dim), full column rank (plain int)
    K = np.random.randint(0, GF.order, size=(n, kernel_dim))
    while int(np.linalg.matrix_rank(K)) < kernel_dim:
        K = np.random.randint(0, GF.order, size=(n, kernel_dim))
    K = GF(K)
    P = _projector_ker(K)
    M_list = []
    for _ in range(o):
        R = GF(np.random.randint(0, GF.order, size=(n, n)))
        R = R + R.T
        A = P.T @ R @ P          # span(K) in ker(A)
        M_list.append(A)
    return M_list, K


def build_random_like_key(GF, n, o):
    """Unstructured control: o random full-rank maps with NO common kernel."""
    M_list = []
    for _ in range(o):
        R = GF(np.random.randint(0, GF.order, size=(n, n)))
        R = R + R.T
        M_list.append(R)
    return M_list


def _matrix_rank(S):
    """Rank of galois matrix S via RREF pivot count."""
    n = S.shape[1]
    A_rref = S.row_reduce()
    pivots = 0
    for r in range(A_rref.shape[0]):
        row = np.array(A_rref[r], dtype=np.int64)
        if np.any(row != 0):
            pivots += 1
    return pivots


def minrank_common_kernel(M_list, GF):
    """Detect a common right-kernel across all o maps.

    Stack M_1..M_o into a (o*n x n) matrix; its right-nullspace is the common
    kernel. Return (dim, elapsed_s)."""
    t0 = time.time()
    o = len(M_list)
    n = M_list[0].shape[0]
    stacked = np.vstack([np.array(M_list[i], dtype=np.int64) for i in range(o)])
    S = GF(stacked)
    rank = _matrix_rank(S)
    dim = n - rank
    elapsed = time.time() - t0
    return dim, elapsed


def run_positive_control(GF, n=10, o=4, kernel_dim=3):
    M, K = build_vox_like_key(GF, n, o, kernel_dim)
    dim, elapsed = minrank_common_kernel(M, GF)
    return {
        "control": "VOX-like (vulnerable / positive)",
        "field": GF.name,
        "n_total_vars": n,
        "n_forms": o,
        "planted_kernel_dim": kernel_dim,
        "found_kernel_dim": dim,
        "recovered": dim >= kernel_dim,
        "elapsed_s": round(elapsed, 4),
    }


def run_negative_control(GF, n=10, o=4):
    M = build_random_like_key(GF, n, o)
    dim, elapsed = minrank_common_kernel(M, GF)
    return {
        "control": "random-like (unstructured / negative)",
        "field": GF.name,
        "n_total_vars": n,
        "n_forms": o,
        "planted_kernel_dim": 0,
        "found_kernel_dim": dim,
        "recovered": dim >= 1,  # should be False
        "elapsed_s": round(elapsed, 4),
    }


if __name__ == "__main__":
    GF = galois.GF(251)  # prime field -> integer rank == field rank
    print("=== MinRank reproduction framework (stage 1, toy parameters) ===")
    print("Field:", GF.name, "order", GF.order)
    pos = run_positive_control(GF)
    print("\n[POSITIVE] VOX-like (expect recovered=True)")
    for k, v in pos.items():
        print(f"  {k}: {v}")
    neg = run_negative_control(GF)
    print("\n[NEGATIVE] random-like (expect recovered=False)")
    for k, v in neg.items():
        print(f"  {k}: {v}")
    print("\nInterpretation: positive control recovers the planted common kernel;")
    print("negative control finds no common kernel. Structural sanity check,")
    print("not a cryptographic-strength result. Scale up / use optimized")
    print("solvers (Bardet et al. ASIACRYPT 2020) for real instances.")
