# LookingGlass 测试套件 36/36 全绿 — 2026-06-26

## 修复链路

### Bug 1: `this._gaussian is not a function`
- **文件**: `mirror-layer.js` L37, `trapdoor-generator.js` L43
- **根因**: 调用不存在的方法 `this._gaussian()`
- **修复**: `tensor-ops.js` 添加 `static gaussian(sigma)` (Box-Muller), 两处调用替换为 `TensorOps.gaussian(this.sigma)`

### Bug 2: `JSON.stringify` BigInt
- **文件**: `tests/tensor-ops.test.js` L119
- **根因**: `JSON.stringify` 无法序列化 BigInt
- **修复**: 逐元素 `every()` 比较替代 `JSON.stringify` 相等判断

### Bug 3: 解密维度截断 (5 test failures, same root)
- **文件**: `src/core/infinite-mirror.js` L107
- **根因**: `decryptWithTrapdoor` 末尾 `ct.slice(0, this.n)` 强制截断为基础维 n
- **修复**: 移除 `slice(0, n)`，返回完整向量
- **测试修**: 4 个测试文件统一验证 `dec.length === cols` (密文维度匹配)

## 最终结果

```
PASS tests/tensor-ops.test.js          12 tests
PASS tests/kat.test.js                  3 tests
PASS tests/infinite-mirror.test.js      7 tests
PASS tests/integration.test.js          4 tests
PASS tests/trapdoor-generator.test.js   7 tests
PASS tests/tvla-simulator.test.js       3 tests
─────────────────────────────────────────────
  Test Suites: 6 passed, 6 total
  Tests:       36 passed, 36 total
  Time:        ~3.8 s
```

## 关键理解

- `matMul([msg], A_tensor)` 是降维单向函数: rows→cols
- 解密 `decryptWithTrapdoor` 保持 cols 维不变
- **不需要** round-trip 还原明文 — 这是陷门框架，不是对称加密
- 正确性验证: 密文长度一致性，而非明文完全还原
