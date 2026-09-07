# DMH→DMTH 公开发布文档 — 2026-06-26 23:10 CST

## 修正摘要

| 日期 | 发现 | 修正 |
|------|------|------|
| 2026-06-26 22:20 | BKZ 结构分析确认公钥是标准 LWE | DMH→DMTH 全链重写 |
| 2026-06-26 23:02 | 代码 + 回归全部通过 | 35/35 Smoke, 31/31 E2E |
| 2026-06-26 23:10 | 论文 + 文档 + 存证 | 6 TSR, 全 Granted |

## 修改文件清单 (7 files)

| # | 文件 | 类型 | 修正内容 |
|---|------|------|----------|
| 1 | `lookingglass/paper/paper_main.tex` | 论文 | 全篇重写: DMH→DMTH, 新增 §3 公钥分析, §5 BKZ 验证, 模型修正声明 |
| 2 | `lookingglass/paper/paper_main.pdf` | PDF | 编译输出 (5pp, 361KB) |
| 3 | `07_Electron_D盘原/README.md` | README | badge/特性表/描述 DMH→DMTH |
| 4 | `ARCHITECTURE.md` | 架构文档 | 特性/目录结构/描述 DMH→DMTH |
| 5 | `pqc-init.js` | 代码 | 日志双线: DMTH trapdoor + LWE attack |
| 6 | `lg-keyexchange.js` | 代码 | 4 处注释 DMH→DMTH |
| 7 | `lookingglass/index.js` | 代码 | 新增 `estimateLWEAttackComplexity()` |

## 论文关键变更

### 标题
- 旧: DMH: Depth-Multiplicative Hardness
- 新: DMTH: Depth-Multiplicative Trapdoor Hardness

### 核心发现
- 公钥 `(A₀, b₀)` 是标准 LWE 实例，攻击者看不到 depth
- depth 作用域: 陷门构造，非攻击计算复杂度
- BKZ 验证确认 LLL 行为匹配标准 n 维 LWE

### 新增节
- §3 DMTH Definition: 标准 LWE (公钥) ⊕ DMTH (d层陷门)
- §5 Structural Validation: Kannan 格嵌入 + LLL 验证
- Abstract: 模型修正声明

## TSR 存证

| ID | 文件 | 状态 |
|----|------|------|
| lg-dmth-01 | paper_main.tex v2 | ✅ Granted |
| lg-dmth-02 | paper_main.pdf | ✅ Granted |
| lg-dmth-03 | README.md | ✅ Granted |
| lg-dmth-04 | ARCHITECTURE.md | ✅ Granted |
| lg-dmth-05 | pqc-init.js | ✅ Granted |
| lg-dmth-06 | lg-keyexchange.js | ✅ Granted |

Total LookingGlass TSRs: 22 (v1) + 10 (Integration) + 6 (DMTH correction) = 38

## 术语卡片

- **DMH** (修正前): 声称 depth 乘法放大计算硬度 → ❌ 不成立
- **DMTH** (修正后): depth 乘法放大陷门复杂度 → ✅ 结构验证
- **LWE Security**: 公钥计算安全 (标准 LWE bound)
- **DMTH Security**: 陷门结构复杂度 (辅助指标)
