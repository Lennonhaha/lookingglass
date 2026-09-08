# MinRank common-kernel solver -- canonical SageMath version.
# SPDX-License-Identifier: GPL-3.0-only
#
# This mirrors minrank_solver.py but uses Sage's native GF / matrix over a
# prime field, which is the idiomatic path when SageMath is installed.
# Toy parameters; structural demonstration, not a cryptographic-strength run.
#
# Run inside Sage:  sage minrank_solver.sage   (or attach from a sage prompt)

def build_vox_like_key(p, n, o, kernel_dim):
    GF = GF(p)
    K = random_matrix(GF, n, kernel_dim)
    while K.rank() < kernel_dim:
        K = random_matrix(GF, n, kernel_dim)
    # projector onto ker(span(K)): P = I - K*(K^T*K)^-1*K^T
    P = identity_matrix(GF, n) - K * (K.transpose() * K).inverse() * K.transpose()
    M = []
    for _ in range(o):
        R = random_matrix(GF, n, n)
        R = R + R.transpose()
        M.append(P.transpose() * R * P)
    return M, K

def build_random_like_key(p, n, o):
    GF = GF(p)
    return [random_matrix(GF, n, n) + random_matrix(GF, n, n).transpose()
            for _ in range(o)]

def common_kernel_dim(M):
    n = M[0].nrows()
    S = matrix(M[0].base_ring(), M[0].nrows() * len(M), n,
               lambda i, j: M[i // M[0].nrows()][i % M[0].nrows(), j])
    return n - S.rank()

def run_positive(p=251, n=10, o=4, kernel_dim=3):
    M, K = build_vox_like_key(p, n, o, kernel_dim)
    dim = common_kernel_dim(M)
    return {"planted": kernel_dim, "found": dim, "recovered": dim >= kernel_dim}

def run_negative(p=251, n=10, o=4):
    M = build_random_like_key(p, n, o)
    dim = common_kernel_dim(M)
    return {"planted": 0, "found": dim, "recovered": dim >= 1}

if __name__ == "__main__":
    pos = run_positive()
    neg = run_negative()
    print("VOX-like (positive):", pos)
    print("random-like (negative):", neg)
