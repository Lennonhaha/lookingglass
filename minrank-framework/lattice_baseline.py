"""MinRank -> lattice baseline (standalone BKZ-cost heuristic).

SPDX-License-Identifier: GPL-3.0-only

HONESTY / SCOPE NOTE
--------------------
This is a SELF-CONTAINED reimplementation of the well-known Albrecht-Player-Scott
(J. Math. Cryptology 2015) BKZ cost heuristic. It is NOT the `lattice-estimator`
package (a.k.a. `estimator`), which could not be installed here because its
`fpylll`/`fplll` C++ dependency does not build on native Windows.

Use this only as a *teaching baseline* to compare MinRank problem sizes against
lattice-reduction cost. It is intentionally simple and omits many of the
estimator's refinements. Do NOT cite its numbers as a hardness claim.

Model chosen (documented, simple):
  A MinRank instance over n variables with common-kernel target rank r and o
  quadratic forms reduces (in the textbook construction) to a lattice of
  dimension  d = o * (n - r).
  We then report, for that d:
    * root-Hermite factor delta(beta)  (Chen-Nguyen approximation)
    * BKZ-#calls ~ (2/3) * beta * log_{delta}(d)     (enough tours to beat dim d)
    * per-SVP cost ~ 2**(0.2075 * beta**2)           (Siegel-root heuristic)
    * total log2 cost = log2(#calls) + log2(per-SVP cost)
"""

from __future__ import annotations
import math


def chen_nguyen_delta(beta: int) -> float:
    """Approximate BKZ root-Hermite factor delta_beta (Chen-Nguyen 2011)."""
    if beta <= 1:
        return 1.0
    beta_f = float(beta)
    return ((beta_f / (2.0 * math.pi * math.e)) ** (1.0 / beta_f)
            * (math.pi * beta_f) ** (1.0 / beta_f)) ** (1.0 / (2.0 * beta_f))


def bkz_cost_log2(beta: int, dim: int) -> dict:
    """Return a dict of BKZ-cost ingredients for block size beta on a lattice of
    given dimension `dim`. All logs base 2. Returns log2 of cost, not absolute."""
    if dim <= 0:
        return {"beta": beta, "dim": dim, "calls_log2": 0.0,
                "svp_cost_log2": 0.0, "total_log2": 0.0}
    delta = chen_nguyen_delta(beta)
    ln_delta = math.log(delta)
    # tours to reduce a dim-d lattice: log_{delta}(dim)  ~ ln(dim)/ln(delta)
    tours = max(1.0, math.log(dim) / ln_delta) if ln_delta > 0 else 1.0
    calls = (2.0 / 3.0) * beta * tours
    calls_log2 = math.log2(calls) if calls > 0 else 0.0
    svp_cost_log2 = 0.2075 * beta * beta
    total = calls_log2 + svp_cost_log2
    return {
        "beta": beta, "dim": dim,
        "delta": delta,
        "tours": tours,
        "calls_log2": calls_log2,
        "svp_cost_log2": svp_cost_log2,
        "total_log2": total,
    }


def minrank_lattice_dim(n: int, o: int, r: int) -> int:
    """Simple MinRank->lattice dimension reduction (d = o*(n - r)).
    Documented as the textbook construction; not a claim of optimality."""
    return max(0, o * (n - r))


def minrank_baseline(n: int, o: int, r: int, beta: int = 40) -> dict:
    """Full baseline for a MinRank instance (n vars, o forms, target rank r)."""
    d = minrank_lattice_dim(n, o, r)
    cost = bkz_cost_log2(beta, d)
    return {
        "n": n, "o": o, "target_rank_r": r,
        "lattice_dim_d": d,
        "bkz_block_beta": beta,
        **cost,
    }


if __name__ == "__main__":
    print("=== MinRank -> lattice BKZ-cost baseline (APS 2015 heuristic) ===")
    print("NOTE: standalone reimplementation, NOT the lattice-estimator package.\n")
    for (n, o, r) in [(10, 4, 3), (12, 4, 1), (12, 4, 0)]:
        b = minrank_baseline(n, o, r, beta=40)
        print(f"n={n} o={o} r={r} -> lattice_dim={b['lattice_dim_d']} "
              f"| beta=40 total_log2_cost={b['total_log2']:.2f}")
    print("\nLarger beta escalates cost fast (0.2075*beta^2 dominates):")
    for beta in (20, 40, 60, 80):
        c = bkz_cost_log2(beta, 200)
        print(f"  beta={beta:>3} -> total_log2_cost={c['total_log2']:.2f}")
