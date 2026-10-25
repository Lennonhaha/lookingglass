# lookingglass

**Lattice-based trapdoor / LWE research code.** A companion research repository to
[FIBEMATE](https://github.com/Lennonhaha/fibemate), exploring lattice (LWE) trapdoor
constructions and their cryptanalytic implications.

> ⚠️ **Research code — NOT production, NOT a secure implementation.**
> This repository is exploratory. It contains no constant-time guarantees, no
> side-channel hardening, and no validated parameter sets. Do not use any code
> here in a real system.

## What this is

- `src/` — Node.js implementation of the "infinite mirror" layered trapdoor
  architecture over lattice tensors (per `package.json` description).
- A Jest test suite (`npm test`) covering the toy constructions.

## Status

- Early-stage research. Parameters are illustrative, not cryptographically sized.
- The `experimental/minrank` branch holds a MinRank common-kernel reproduction
  framework (Kipnis-Shamir family) used to study rank-defect structures in
  multivariate / lattice-adjacent schemes.

## License

GPL-3.0-only. See [LICENSE](./LICENSE). The declared `package.json` license
field (`GPL-3.0-only`) is satisfied by that file.

## Related

- `fibemate` — the PQC engineering-validation platform this research informs.
- `lookingglass-v2` — related confusion / traffic-obfuscation research (Rust + WASM).

## Negative Result Notice

The depth-multiplicative trapdoor construction (DMTH) explored in this repository was
later falsified. The failure analysis, model correction, and empirical data (LLL lattice
reduction and χ² independence tests) are archived at
[DOI: 10.5281/zenodo.23638522](https://doi.org/10.5281/zenodo.23638522).

In short: the depth parameter does not appear in the attacker's view — the public key is a
standard LWE instance — so “depth amplifies attack hardness” cannot hold; and the
replacement hypothesis (“trapdoor structure complexity”) carries no reduction, with its
metric being a formula rather than a measurement.

*No security claim is made for this construction.*
