# 🌙 LookingGlass Test Suite

## Test Overview

| Module | Content | File |
|--------|---------|------|
| Unit | Tensor ops, matrix mul, random | tests/tensor-ops.test.js |
| Trapdoor | Key gen, encrypt-decrypt, security | tests/trapdoor-generator.test.js |
| Infinite Mirror | Multi-layer nesting, attack complexity | tests/infinite-mirror.test.js |
| KAT | Deterministic verification | tests/kat.test.js |
| TVLA | Side-channel simulation | tests/tvla-simulator.test.js |
| Integration | E2E workflow, benchmarks | tests/integration.test.js |

## Running

```bash
npm install --save-dev jest
npm test                          # all tests + coverage
npm test -- tests/tensor-ops.test.js  # single module
npm test -- --watch               # dev mode
```

## Coverage Targets

| Module | Target | Status |
|--------|--------|--------|
| tensor-ops.js | 90% | ⬜ |
| mirror-layer.js | 85% | ⬜ |
| infinite-mirror.js | 85% | ⬜ |
| trapdoor-generator.js | 80% | ⬜ |
| **Overall** | **85%** | ⬜ |

## Expected Output

```
PASS tests/tensor-ops.test.js
PASS tests/trapdoor-generator.test.js
PASS tests/infinite-mirror.test.js
PASS tests/kat.test.js
PASS tests/tvla-simulator.test.js
PASS tests/integration.test.js

Test Suites: 6 passed, 6 total
Tests: 42 passed, 42 total
```
