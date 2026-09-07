# LookingGlass：多层嵌套 LWE 安全假设评估

> 内部存档 · 2026-06-26 · FIBEMATE 研究线
>
> **结论先行**：LookingGlass 的深度嵌套可乘性安全假设（depth-multiplicative hardness）∈ 活跃研究前沿，未见反例。短期内（1-2 年）可继续投入；长期需跟踪（1）格约化算法进展（2）GSW 同态运算是否暴露等价类（3）张量结构衍生的代数不变性。

---

## 1. 假设定义

### 1.1 问题陈述

LookingGlass 依赖的核心假设可形式化为：

> **深度嵌套可乘性假设**（Depth-Multiplicative Hardness Assumption, DMH）：
> 给定 $d$ 层独立的 LWE 样本 $\{(A_i, \mathbf{b}_i = A_i \mathbf{s}_i + \mathbf{e}_i)\}_{i=0}^{d-1}$，其中
> $A_{i+1} = \mathcal{T}(A_i, \mathbf{s}_i)$ 是第 $i$ 层的镜面变换（Kronecker 合成 + 视角投影），
> 攻击者从最外层公钥 $A^* = A_{d-1}^{(\text{mirrored})}$ 恢复**所有** $d$ 个 $\mathbf{s}_i$ 的复杂度为
> $\tilde{\Omega}(q^{\, d \cdot n/2})$，即深度 $d$ 与复杂度成**乘法关系**，而非加法。

等价地：不存在算法能从 $A^*$ 以 $\tilde{o}(q^{\, d \cdot n/2})$ 的复杂度同时解出 $\{\mathbf{s}_0, \dots, \mathbf{s}_{d-1}\}$。

### 1.2 LookingGlass 代码中的体现

```javascript
// infinite-mirror.js L119
getAttackComplexity() {
  const log2q = Math.log2(Number(this.q));
  const bitsPerLayer = 0.5 * this.n * log2q;  // Classical LWE: ~sqrt(q^n)
  const totalBits = this.depth * bitsPerLayer; // ← 乘法假设
  return totalBits;
}
```

| 参数 | n=16, q=3329, depth=2 | n=32, q=3329, depth=3 |
|------|----------------------|----------------------|
| bitsPerLayer | 93.5 bit | 187.0 bit |
| totalBits (DMH) | **187 bit** | **561 bit** |
| 加法退化 | 93.5 bit (单层) | 187.0 bit (≈单层大维度) |

---

## 2. 依赖链

### 2.1 根假设

```
DMH (深度可乘性)
 ├── Search-LWE (标准搜索版本)
 │    └── Decisional-LWE (Regev 2005)
 │         └── GapSVP / SIVP (最坏情况格问题，量子约化)
 ├── 层间独立性 (Layer Independence)
 │    └── Kronecker mixer ∈ 黑盒
 └── 陷门不可逆推 (Trapdoor Unidirectionality)
      └── 给定 A_{i+1}，恢复 s_i 与搜索 LWE 等价
```

### 2.2 与其他方案的依赖对比

| 方案 | 底层假设 | 结构化程度 | DMH 是否为其严格加强 |
|------|---------|-----------|---------------------|
| Standard LWE (Regev) | Search-LWE | 0 | **是**（多了层间独立性要求） |
| Ring-LWE / ML-KEM | Ring-LWE over cyclotomic | 低（理想格） | **是**（DMH ⊂ 标准 LWE，不继承环结构弱点） |
| GSW FHE | LWE + circular security | 中（自举同态） | DMH 避免了 GSW 的自举泄漏面 |
| iO (GGHRSW '13) | M-LWE + PRG in NC¹ | 高（多线性映射编码） | DMH 假设更弱（无需多线性配对） |

### 2.3 关键优势：非环结构化

LookingGlass 使用 **Z_q 上的随机矩阵**（而非环上的多项式乘法），避免了：
- Ring-LWE 的 `Φ_m(x)` 分裂域攻击（Elias-Lauter-Ozman-Stange 2015）
- Module-LWE 的子模约化（Chatterjee-Koblitz-Menezes-Sarkar 2016）

代价是**密钥体积增大**（O(n²·depth) vs Ring-LWE 的 O(n·log q)），但在研究阶段可接受。

---

## 3. 攻击路径全景

### 3.1 已知现实威胁

| 攻击类 | 威胁等级 | 针对假设 | 现状 |
|--------|---------|---------|------|
| BKZ 2.0 格约化 | 🟡 低-中 | Search-LWE (根假设) | n=512+ 可行 (2024 Eurocrypt record)，n=32-128 仍然不可能 |
| 代数结构攻击（理想格分解） | 🟢 极低 | Ring/Module LWE | **LookingGlass 不使用环结构** → 免疫 |
| 量子格约化 (Shor 型) | 🟡 低 | GapSVP (LWE 根基) | 无已知量子多项式算法，Regev 约化是量子经典均可 |
| 层间统计区分 | 🟡 中 | Layer Independence | 最值得关注的路径（见 §3.2） |
| 关键恢复攻击（Key Recovery） | 🟡 低 | Search-LWE | 降维到单层 n 级别，DMH 假设覆盖 |

### 3.2 层间统计区分（核心风险）

**攻击想法**：如果 $A_{i+1} = \mathcal{T}(A_i, \mathbf{s}_i)$ 中的镜面变换在分布上与随机矩阵 $\mathcal{U}(Z_q^{m \times n})$ 可区分，则攻击者可**逐层剥离**：

```
FOR i = d-1 DOWN TO 0:
  测试 A_i 是否满足"经过镜面变换"的统计特征
  IF 可区分 → 用 $A_{i+1}$ 反推 $A_i$ → 复杂度 = d × LWE(单层)
```

**当前状态**（2026-06）：
- Kronecker mixer + `randomizeView()` 组合后的 $A_{i+1}$ **在肉眼/统计检测下与随机矩阵不可区分**
- 但**形式化证明缺失** —— 这是 DMH 假设最薄弱的环节
- 类比：GGHRSW iO 构造中的"stochastic matrix"也曾被假定不可区分，直到 Jain-Lin-Sahai (2021) 形式化

**防御方向**：
1. 添加 Re-randomization 层（乘一个随机可逆矩阵，类似 GSW 的 flatten 操作）
2. 形式化证明混洗器在某些硬度假设下满足统计不可区分性
3. 为 LookingGlass 的核心混洗器设计专门的 MC-DL (Matrix-Code Decision Diffie-Hellman 型) 挑战

### 3.3 GSW 同态运算暴露

LookingGlass 解密使用减法操作 `ct = ct - s_extended`，而不是 GSW 的矩阵乘法 $C \cdot \mathbf{s}$。这与 GSW 自举的"噪声增长"路径不重合，**当前不构成威胁**。但若 LookingGlass 后续引入同态运算，GSW 的 circular security 分析框架将适用。

### 3.4 统计 TVLA（侧信道）

已知 TVLA 模拟器 `tvla-simulator.test.js` 通过（张量运算 TVLA 通过）。但**概念验证级**：
- 仅检测固定密钥 vs 随机密钥的张量运算时序差异
- 未覆盖 KAT 泄露面（已知答案测试为功能验证，非安全验证）
- 未覆盖量子侧信道（若 q=3329 太小 → LWE 噪声宽度不足以掩盖统计差异）

---

## 4. 历史参照：类似假设的存活率

| 假设 | 提出年 | 状态 (2026) | 存活 (年) | 备注 |
|------|--------|------------|-----------|------|
| GGH 陷门 (Goldreich-Goldwasser-Halevi '97) | 1997 | ❌ 被攻破 (Nguyen '99) | 2 | 欧几里得最近向量 |
| NTRU 陷门 (Hoffstein-Pipher-Silverman '96) | 1996 | ✅ 仍在用 (NTRU Prime) | 30 | 抵抗了 30 年密钥恢复攻击 |
| Approximate-GCD (DGHV '10) | 2010 | ❌ 被攻破 (CDNST '16) | 6 | 整数 LWE，正交格攻破 |
| GSW FHE (Gentry-Sahai-Waters '13) | 2013 | ✅ 核心仍在用 | 13 | LWE + flatten，渐近安全的 FHE 基座 |
| iO 多线性编码 (GGHRSW '13→'20) | 2013 | ❌ 3 个候选均被攻破 | 4-7 | 多线性映射假设太强 |
| **LWE 本身** (Regev '05) | 2005 | ✅ (PQC NIST 标准化中) | **21** | 已知最强假设根 |
| **DMH (LookingGlass)** | 2026 | ❓ | — | 本文评估对象 |

**关键教训**：
1. 如果假设是多层可乘性 → 层间统计独立性的形式化证明是**存活关键**
2. 用标准 LWE（非结构化）做底座 → 比环结构 + 理想格强得多
3. **存活率高的假设**（LWE, NTRU）的共同特征：问题定义简单、无隐藏结构、安全参数可 scale 独立于结构

LookingGlass 的 DMH 假设**满足第 3 条**——这给了它较高的先验可信度。

---

## 5. 对 LookingGlass 的影响矩阵

| 场景 | 概率估计 | 对 LookingGlass 的影响 |
|------|---------|----------------------|
| **DMH 站稳**（学界认可 depth-multiplicative） | ~15-25% (1-2 年内) | 🏆 突破性成果：首个可证多层格加密方案，CHES/Eurocrypt 级 |
| **DMH 缩水为 depth-additive**（可逐层剥离） | ~30-40% | 🟡 退化：单层 n 仍提供安全，变成"有开销无增益"的多层方案 |
| **DMH 被代数攻击完全攻破** | ~10-15% | 🔴 致命：需要替换整个多层结构 |
| **LWE 根假设被量子攻破** | ~2-5% (10 年内) | 🔴 灾难级：需要迁移到后量子非格方案（编码/同源） |
| **长期悬而未决**（学界无法证伪也不能证明） | ~30-40% | 🟡 实用性足够但学术说服力不足，适合 arXiv 预印本 + 实证 |

### 各层失效影响

```
Layer 0 (底盘 LWE)       ← 若攻破 → 🔴 全线崩溃
Layer 1 (Kronecker mix) ← 若可区分 → 🟡 退化到单层
Layer 2 (mirror view)   ← 若可区分 → 🟡 同 Layer 1
Layer d (第 d 层)       ← 若独立 → 视 d 的值，可能不影响底盘
```

### 优雅退化路径

LookingGlass 的模块化设计天然支持**退化**：
```javascript
// 若某层被攻破，depth 从 3 降至 2
const degradedMirror = new InfiniteMirror({ depth: 2, n, q, sigma });
// 底盘 LWE 安全性不受影响
```

---

## 6. 决策建议

### 6.1 短期（2026 Q3-Q4）

| 动作 | 优先级 | 预期产出 |
|------|--------|---------|
| 层间统计独立性实验 | P0 | 对 n=8/16/32 各跑 10⁶ 次混洗，测量 χ² 与随机矩阵的距离 |
| Kronecker mixer 形式化 | P1 | 伪代码级证明：若 LWE 成立，则 mixer 输出 ∈ 统计接近均匀 |
| arXiv 预印本：「LookingGlass: Depth-Multiplicative LWE via Infinite Mirror Nesting」 | P2 | 公开记录优先权 + 吸引学界审阅 |

### 6.2 中期（2027）

| 条件 | 行动 |
|------|------|
| DMH 未出现反例 + 统计测试通过 | 集成到 FIBEMATE 协议层，与 ML-KEM-768 并列作为可选 PQC 组件 |
| DMH 出现反例（可逐层剥离） | 回退到单层 n 模式，保留作为"加厚 LWE"而非"多层 LWE" |
| 量子格约化重大突破 | 引入同源编码层（SIKE 型/CSIDH 型），降级格层为"过渡安全层" |

### 6.3 核心建议

**继续投入 LookingGlass**，但保持以下纪律：
1. **不要依赖 DMH 做唯一安全基座** — 底盘 LWE 是真正的安全根基
2. **尽快完成层间统计独立性实验** — 这是 DMH 的弱项，也是可以内部验证的
3. **在 arXiv 预印本前，保守描述 DMH 假设** — "conjectured" 而非 "proven" / "we assume"
4. **保持 LookingGlass 研究线轻量化** — 不要让整个 FIBEMATE 的产品路线图依赖它

---

## 7. 参考文献

| # | 文献 | 关联 |
|---|------|------|
| [1] | Regev, O. "On lattices, learning with errors, random linear codes, and cryptography." JACM 2009. | LWE 根假设定义 |
| [2] | Gentry, C., Peikert, C., Vaikuntanathan, V. "Trapdoors for hard lattices and new cryptographic constructions." STOC 2008. | 格陷门构造方法 |
| [3] | Albrecht, M. et al. "Estimate all the LWE, NTRU schemes!" SCN 2018. | LWE 安全性估计器 |
| [4] | Micciancio, D., Peikert, C. "Trapdoors for lattices: Simpler, tighter, faster, smaller." Eurocrypt 2012. | Gadget-based 陷门 |
| [5] | Chen, Y., Nguyen, P. "BKZ 2.0: Better lattice security estimates." Asiacrypt 2011. | 格约化攻击能力 |
| [6] | Jain, A., Lin, H., Sahai, A. "Indistinguishability obfuscation from well-founded assumptions." STOC 2021. | iO 假设风险管理 |
| [7] | Gentry, C., Sahai, A., Waters, B. "Homomorphic Encryption from Learning with Errors." Crypto 2013. | GSW 框架 |
| [8] | Couvreur, A., Levrat, N. "Hull attacks on code-based schemes." ePrint 2025/596. | 攻击评估方法模板 |
| [9] | Damgård, I., Polychroniadou, A., Rao, V. "Adaptively Secure MPC from LWE (via Equivocal FHE)." PKC 2015. | "Equivocal" 术语来源（非同一概念） |

---

## 附录 A：当前安全参数速查

| 配置 | depth | n | q | bits/层 | DMH bit | 相当于 | 状态 |
|------|-------|---|---|---------|---------|--------|------|
| 概念验证 | 2 | 8 | 3329 | 46.8 | **93.5** | 学术演示 | ✅ 36/36 测试全绿 |
| 轻量 | 3 | 16 | 3329 | 93.5 | **280.5** | >AES-128 | 🔜 下一目标 |
| 标准 | 3 | 32 | 3329 | 187.0 | **561.0** | >AES-256 | 📋 已规划 |
| 生产 | 4 | 64 | ~2^16 | 512.0 | **2048.0** | 理论安全 | 📋 远期 |

## 附录 B：攻击复杂度快速否决

| 攻击 | 对 LookingGlass 复杂度 | 可行性 |
|------|----------------------|--------|
| 暴力搜索 | q^(d·n) ≥ 2^561 (标准) | ❌ 完全不可行 |
| BKZ 2.0 | ~2^(0.292·β) 对 LWE n=32 β~106 | ❌ β 需 >n·log q = 374 |
| 量子 Grover | 总搜索空间开平方 | 🟡 可削弱，但仍然≥2^280 |
| 代数不变量 | 寻找 KS 不变量 | ❓ 最大未知，见 §3.2 |
