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
