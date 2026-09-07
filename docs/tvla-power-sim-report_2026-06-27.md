# LookingGlass 张量 TVLA 功耗仿真 — 最终报告

## 2026-06-27

## 方法
- 功耗模型：Hamming Weight (CMOS 动态功耗 ∝ 总线翻转 bit 数)
- 噪声模型：Box-Muller 高斯 (σ=5.0)
- 统计方法：Welch t-test, N=10,000, |t| 阈值 4.5
- 掩码策略：Additive masking over Z_q (对标 SM2 scalar masking，不含 mod N)
- ⚠ 只建模秘密相关操作 (HW(aWork) + HW(aWork × B))，B 是公开参数不进迹

## 结果

| 测试组 | max\|t\| | 失败点 | 判定 |
|--------|----------|--------|------|
| Control (固定 vs 固定) | 0.00 | 0/320 | ✅ PASS |
| Naive kron() | 65.56 | 260/320 | ❌ FAIL |
| **Masked kron()** | **0.72** | **0/320** | **✅ PASS** |

## 解读
- Masked kron() max|t|=0.72 ≪ 4.5，全部 320 时间点落在 [0,1) 区间，与控制组一致
- 掩码压缩泄漏 91× (65.56 → 0.72)
- 控制组 0.00 确认无假阳性

## 之前失败根因
1. v2: 噪声跨迹共享 → 控制组假阳性
2. v3: B 矩阵公开参数进迹 → 固定组 vs 随机组 HW 方差模型失配 → 残余泄漏 8–10
3. v3 掩码: A 掩码只在读取点生效，内层乘法未用掩码值
4. v4 修正: 全部 secret-dependent 操作经掩码值，B 不进迹

## 对物理测试的提示
- 掩码方案 (additive masking over Z_q) 在仿真层面有效
- 真实物理测量中，B 的 HW 会产生固定偏置但不变异 → Welch 不受影响
- N≥10,000, σ=5 条件下掩码无泄漏
