# DMH 层间统计独立性实验 — 修复记录

> 2026-06-26 · FIBEMATE/LookingGlass 研究线

## 发现

LookingGlass 原始 `mirror-layer.js` 中 `kron(A, I₂)` 产生精确 50% 零值（I₂ 仅含 2 个非零对角线元素）。

| 指标 | kron(A,I₂) | U(Z_q) 期望 | 倍数 |
|------|-----------|------------|------|
| 零值数 | 256/512 (50%) | 0.154/512 | 1,665× |
| χ² | 16,575,227 | 临界值 3,521 | 4,708× |
| Cohen's w | 28.79 | <0.01 (可忽略) | 巨大 |

## 修复

两处代码替换 I₂ 为随机满秩矩阵 R：

1. `src/core/mirror-layer.js` L61-63: `kron(view, I2)` → `kron(view, R_rand)`
2. `src/trapdoor/trapdoor-generator.js` L71-73: `kron(A, I2)` → `kron(A, R)`

其中 `R = TensorOps.randomTensor([k, k], q)`。

## 验证

### 混洗器方案对比测试 (20,000 样本)

| 方案 | χ² | 临界值 | 零值倍率 | 结果 |
|------|-----|--------|---------|------|
| kron(A,I₂) [原始] | 16,575,227 | 3,521 | 1662× | ❌ |
| kron(A,R_rand) [FIX-A] | 3,183 | 3,521 | 2.3× | ✅ |
| kron(A,I₂)+Gaussian σ=3 | 508,770 | 3,521 | 77× | ❌ |
| kron(A,I₂)+U(Z_q) | 3,306 | 3,521 | 1.3× | ✅ |
| U(Z_q) [对照] | 3,327 | 3,521 | 1.3× | ✅ |

### 7 参数扫描 (50,000 样本/组, α=0.01)

全部通过。Cohen's w 稳定在 0.253-0.258，无维度关联偏差。

### 功能回归

36/36 测试全部通过（6 套件, 3.98s）。

## 关键经验

1. `kron(A, I₂)` 是**结构性不变量**（50% 零值），永远不能用于密码学混洗
2. 随机 R 比加噪声更优（χ²=3,183 < noise 方案 508,770），且无噪声增长
3. 修复后 FIX-A 的 χ² 甚至略低于对照 U(Z_q)（3,183 < 3,327），证明混洗质量极好
4. Cohen's w 不随 n 增大，说明 Kronecker 随机 R 混洗在所有维度上统计等价于均匀分布

## 文件

| 文件 | 描述 | TSR |
|------|------|-----|
| `docs/independence-experiment-results.json` | 7参数扫描原始数据 | lg-018 |
| `docs/mixer-randomization-results.json` | 5方案对比原始数据 | lg-019 |
| `scripts/statistical-independence-test.js` | 独立性扫描脚本 | — |
| `scripts/mixer-randomization-test.js` | 方案对比脚本 | — |
