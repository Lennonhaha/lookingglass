"""Fault-injection bridge stub: connect lookingglass (LWE) failures to MinRank.

SPDX-License-Identifier: GPL-3.0-only

HONESTY / SCOPE NOTE
--------------------
This is a STUB / interface sketch only. It does NOT perform a fault-injection
attack. It documents how, conceptually, an induced fault in an LWE-based
implementation could be modeled as a *rank-defect* structure (the same object
the MinRank solver in minrank_solver.py recovers), so the two research lines
(lookingglass LWE trapdoor code, and this MinRank framework) can later be wired
together.

Nothing here runs an attack. It is a placeholder for the integration wiring,
kept deliberately inert so the repo stays "teaching skeleton", not "exploit".
"""

from __future__ import annotations
import numpy as np
import galois


def lwe_fault_to_rank_defect(*_args, **_kwargs):
    """CONCEPTUAL BRIDGE (not implemented).

    Intended contract (to be filled later, with lookingglass LWE code):
      Input : a faulty LWE sample matrix / noisy secret recovered from a fault
      Output: a candidate (M_list, kernel_dim) triple consumable by
              minrank_solver.minrank_common_kernel, OR None if no defect found.

    Refusal: returns None and a clear 'stub' marker by design. Implementing this
    requires the actual LWE fault model from lookingglass; out of scope for the
    stage-2 skeleton.
    """
    return {"status": "stub", "implemented": False,
            "note": "bridge not wired; see module docstring. Inert by design."}


def as_minrank_probe(M_list, GF):
    """Helper: if a caller DOES produce an M_list, run the existing solver once.

    This is the ONLY live call here, and it just reuses minrank_solver -- it is
    safe (no fault injection performed by this function)."""
    from minrank_solver import minrank_common_kernel
    dim, elapsed = minrank_common_kernel(M_list, GF)
    return {"found_kernel_dim": dim, "elapsed_s": elapsed}


if __name__ == "__main__":
    print("=== lookingglass fault-injection bridge (STUB) ===")
    print(lwe_fault_to_rank_defect())
    print("\nThis module is intentionally inert. Wire it to lookingglass LWE")
    print("fault models only when that research line is actively pursued.")
