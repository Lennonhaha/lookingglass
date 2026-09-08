# MinRank 复现框架（阶段 1：VOX-like 正向 + 随机对照负向）

**SPDX-License-Identifier: GPL-3.0-only**

> ⚠️ **严谨性声明（务必先读）**
> 本框架是 MinRank 攻击**家族**的**教学级最小复现**，参数极小（toy），
> 几十毫秒跑完。它**不是**对 VOX/Rainbow 等已发表攻击在真实参数下的逐位复现——
> 文献里的「2 秒 / 53 小时」来自优化后的多项式系统求解器
> （Bardet et al., ASIACRYPT 2020 及后续工作）在密码学规模参数上的运行，
> **不是**本脚本。
> 本会话**未独立核验**引用文献的具体数字（PQCrypto 2024 / IEICE E108-A /
> ePrint 2026/298 / NIST IR 8610），它们合理但并非本会话权威核证。

## 为什么做两个对照

| 对照 | 构造 | 预期 | 意义 |
|------|------|------|------|
| **VOX-like（正向）** | 公钥二次型共享一个被植入的 rank 缺陷核（公共核） | MinRank 解出该核 → recovered=True | 证明求解器真的能找到结构 |
| **random-like（负向）** | 随机满秩矩阵，**无**公共核 | 找不到公共核 → recovered=False | 证明测试不是「恒成功」的假阳性 |

> 术语更正：经典 **UOV 的油空间本身就是公共核**——这正是 Kipnis-Shamir 恢复的东西，
> 所以 UOV 在原理上也是 MinRank 易感的。负向对照因此命名为 **random-like**
> （无结构的随机矩阵），而非「UOV 安全」。VOX 被单独点名是因为其被植入的
> rank 缺陷比完整 UOV 更大 / 泄漏更快。

## 核心数学（common-kernel MinRank）

对 o 个 n×n 公钥二次型矩阵 M₁…Mₒ，纵向堆叠成 (o·n)×n 矩阵 S；其右零空间
即为「公共核」。若存在非零公共核（维度 ≥ 1），攻击成功。

```
S = [ M₁ ]        ker(S) = { v ≠ 0 : S v = 0 }
    [ M₂ ]
    [ ⋮  ]
    [ Mₒ ]
```

本实现用 RREF 求秩（galois / Sage 的 `row_reduce`），维度 = n − rank(S)。

## 运行方式

### 方案 A：Python + galois（本机已装，非 admin 用户安装，已验证可跑通 ✅）

```powershell
pip install --user galois sympy
python minrank_solver.py     # 跑两个对照并打印结果
python test_vox.py           # 正向测试（预期 PASS）
python test_uov.py           # 负向测试（预期 PASS）
```

### 方案 B：SageMath（待你用官方 GUI 安装器本地安装）

本目录下 `sage/minrank_solver.sage` 是等价的 Sage 版本（原生 GF / 矩阵）。

```bash
sage sage/minrank_solver.sage
```

> 本机当前环境：SageMath **未安装**，WSL2 不可用（需 admin），winget/scoop
> 无 SageMath 包。SageMath 的 Windows 版是交互式 GUI 安装器（约 1.5 GB），
> 无法在本非 admin shell 下静默安装。故阶段 1 用 `galois` 实跑验证。

## 本机运行结果（2026-09-08，GF(251)，n=10, o=4）

| 对照 | 植入核维度 | 求得核维度 | recovered | 耗时 |
|------|-----------|-----------|-----------|------|
| VOX-like（正向） | 3 | 3 | **True (PASS)** | ~1.8 ms |
| random-like（负向） | 0 | 0 | **False (PASS)** | ~2.0 ms |

结论：求解器正确检测到植入的公共核，且在无结构对照下不误报。
这是**结构性 sanity check**，不是密码学强度结论。

## 阶段 2（已落地骨架，2026-09-08）

> ⚠️ **阶段 2 严谨性声明**：以下新增均为**结构骨架 / 接口桩**，不是真实攻击实现，
> 不产生任何密码学攻击数字。
> - `lattice-estimator`（`estimator` 包）本机**装不上**（依赖 `fpylll`/`fplll` C++ 库，
>   原生 Windows 无法编译）→ 改用**自写 BKZ 成本启发式**（Albrecht-Player-Scott 2015
>   根 Hermite 因子 + 0.2075·β² 启发），**明确标注为独立再实现，非 `estimator` 包**。
> - SNOVA / MAYO 以**秩缺陷签名**建模（MinRank 真正利用的属性），**非真实参数集**。
> - `lg_fault_bridge.py` 是**惰性桩**（故意不执行注入），仅预留与 lookingglass
>   LWE 故障模型的接线接口。
> - 文献引用（PQCrypto 2024 / CRYPTO 2026 / IEICE / ePrint 2026/298）**本会话未独立核验**。

| 文件 | 内容 | 诚实定位 |
|------|------|----------|
| `minrank_stage2.py` | SNOVA-like（大秩缺陷→MinRank 可解）+ MAYO-like（小缺陷→抗性更强）+ 随机对照 | 秩签名骨架 |
| `lattice_baseline.py` | MinRank→格维度 `d=o·(n−r)` 的 BKZ 成本（APS 2015 启发式） | 自写再实现，非 `estimator` |
| `lg_fault_bridge.py` | lookingglass LWE 故障→MinRank 缺陷的接线接口 | 惰性脑桩 |

```powershell
python minrank_stage2.py    # 前沿秩签名骨架（预期 rc=0，打印三段结果）
python lattice_baseline.py  # BKZ 成本基线（教学用，非权威硬度）
python lg_fault_bridge.py   # 惰性桩，打印 stub 标记
```

### 阶段 2 本机结果（GF(251)，toy 参数）

`minrank_stage2.py`：
- SNOVA-like（n=12,o=4,defect=3）→ 应 recovered=True（MinRank 找到植入核）
- MAYO-like（n=12,o=4,defect=1）→ toy 参数下可能找到 dim-1（真实规模才是抗性来源）
- random-like → recovered=False（无缺陷，正确不报）

`lattice_baseline.py`：打印 `d=o·(n−r)` 与 β=40/60/80 的 log2 成本，仅作尺度对照。

### 待办（不阻塞，按需推进）

- 真实 `estimator` 包需在 WSL/ Linux 下 `pip install estimator`（本机原生 Windows 受限）
- SNOVA/MAYO 升级为**真实参数集**需引用已核证文献（当前未核证，勿产攻击数字）
- `lg_fault_bridge.py` 接入 lookingglass LWE 故障模型（STM32 + TVLA + ChipWhisperer）

## 参考

- Kipnis & Shamir, "Cryptanalysis of the HFE Public Key Cryptosystem", CRYPTO 1999
- Kipnis, Shamir & Patarin (Connell), "Cryptanalysis of the Oil and Vinegar
  Signature Scheme", CRYPTO 1999
- Bardet et al., "Improvements of Algebraic Attacks for Solving the Rank
  Decoding and MinRank Problems", ASIACRYPT 2020
