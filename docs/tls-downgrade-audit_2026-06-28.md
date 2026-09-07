# TLS 降级攻击协议验证 — FIBEMATE PQC Hybrid (路径 C)

**审查日期**: 2026-06-28  
**审查范围**: Nginx → Node.js → 浏览器端 全链路 PQC 混合握手

---

## 架构回顾

```
浏览器 ←TLS 1.3→ Nginx(443) ──proxy_pass──→ Node.js(:3001)
                  │ $ssl_session_id           │
                  │ proxy_set_header           │ ML-KEM-768 keygen
                  │ X-TLS-Session-Id ─────────→│ HKDF(sid, ss_pqc)
                                               │ → sessionKey
```

---

## 攻击面逐项验证

### 1. HTTP 降级 (MITM 剥离 TLS) — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| Port 80 重定向 | ✅ | `return 301 https://$server_name$request_uri;` |
| HSTS 头 | ✅ | `max-age=63072000; includeSubDomains; preload` |
| `/api/` 仅在 443 server block | ✅ | Port 80 无 `/api/` location |

**结论**: 攻击者无法通过 HTTP 访问 `/api/pqc-hybrid/*`。

### 2. TLS 版本降级 (1.3→1.2) — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| ssl_protocols | ✅ | `TLSv1.3;` — 仅 TLS 1.3 |
| 无 TLS 1.2 回退 | ✅ | 列表中无 `TLSv1.2` |

**结论**: 攻击者无法将连接降级到 TLS 1.2。

### 3. 密码套件降级 — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| ssl_prefer_server_ciphers | ✅ | `off` — 客户端选择 |
| ssl_ciphers 列表 | ✅ | 全 ECDHE — 无静态 RSA/DH |

**结论**: 所有可用密码套件均提供前向安全性。无弱密码套件。

### 4. Session ID 伪造 — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| X-TLS-Session-Id 来源 | ✅ | Nginx `proxy_set_header` 自动注入 `$ssl_session_id` |
| 客户端不可设置 | ✅ | Node.js 读取 `req.headers['x-tls-session-id']`，客户端 HTTP 头被 Nginx 覆盖 |
| fallback 生成 | ✅ | `crypto.randomBytes(16)` — 仅当 Nginx 连接非 TLS 时触发（正常情况不应发生） |

**结论**: Session ID 由 Nginx 在 TLS 层生成，客户端无法伪造。

### 5. Session 重放 — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| 一次性使用 | ✅ | `sessions.delete(sessionId)` 在 `finalize` 中 |
| TTL 过期 | ✅ | 5 分钟 `cleanExpired()` |

**结论**: 同一 sessionId 的第二次 finalize 返回 410。

### 6. PQC 模块不可用时的静默降级 — ✅ SAFE

| 检查项 | 状态 | 证据 |
|--------|------|------|
| 服务端 ML-KEM 不可用 | ✅ | routes 不挂载，`/status` 返回 `enabled: false` |
| 客户端 ML-KEM 不可用 | ✅ | `init()` 抛出异常，`doHybridExchange()` 传播错误 |
| 无静默回退 | ✅ | 客户端无 `catch(() => fallbackToPlainTLS())` 逻辑 |

**结论**: PQC 失败 = 显式错误，不静默降级。

---

## ⚠️ 发现问题

### Bug #1: HKDF Expand 实现分歧 (Medium)

**位置**: `www/crypto/pqc-hybrid-client.js:40-43` (`_hkdfExpand`)

**问题**: 客户端使用 Web Crypto API 的 `deriveBits({name: 'HKDF', ...})`，它在内部执行 extract(zeros, prk) → prk2，然后 expand(prk2, info, 32)。但服务端 `hkdfExpand()` 直接用 PRK 作为 HMAC 密钥执行 Expand——跳过了 extract 步骤。

```
Server: HKDF-Expand(PRK, info, 32)           ← PRK = HMAC(sid, ss)
Client: HKDF(sql:zeros, PRK, info, 32)      ← PRK' = HMAC(zeros, PRK)
                                              then Expand(PRK', info, 32)
Result: sessionKey_client ≠ sessionKey_server  ← 分歧！
```

**影响**: 客户端和服务端派生出**不同的** sessionKey。实际使用中双方无法解密对方的消息。

**修复方案**: 客户端 `_hkdfExpand` 改用 `HMAC` 原语逐块展开，与服务端 `hkdfExpand` 对齐：

```js
// Web Crypto 正确的 HKDF-Expand（仅 expand，不重新 extract）
async function _hkdfExpand(prk, info, length) {
  const n = Math.ceil(length / 32);
  const hmacKey = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const blocks = [];
  let prev = new Uint8Array(0);
  for (let i = 0; i < n; i++) {
    const data = new Uint8Array([...prev, ...info, i + 1]);
    prev = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, data));
    blocks.push(prev);
  }
  return new Uint8Array(blocks.flat()).slice(0, length);
}
```

**严重程度**: Medium — 实际使用中导致密钥分歧，但 E2E 测试页用相同 bug 的 derivation 所以自检通过。

### Bug #2: PQC Hybrid 未集成到主应用 (Low — Architectural)

**位置**: 全局代码搜索

**问题**: `PqcHybridClient.doHybridExchange()` 仅在 `pqc-hybrid-e2e.html` 和自身 JS 文件中被引用。主应用的 `privacy-layers/` 和消息流中无任何调用。

**影响**: PQC 混合握手是一个**独立演示模块**，尚未集成到实际通信流水线。当前所有消息仅依赖 TLS 1.3 的原生安全性。

**修复方案**: 在消息发送前调用 `doHybridExchange()`，用派生的 sessionKey 对消息做额外 AEAD 加密（叠加到 TLS 之上）。

---

## 总结

| # | 向量 | 状态 |
|---|------|------|
| 1 | HTTP 降级 | ✅ SAFE |
| 2 | TLS 版本降级 | ✅ SAFE |
| 3 | 密码套件降级 | ✅ SAFE |
| 4 | Session ID 伪造 | ✅ SAFE |
| 5 | Session 重放 | ✅ SAFE |
| 6 | PQC 静默回退 | ✅ SAFE |
| 7 | HKDF 实现分歧 | ⚠️ BUG (Medium) |
| 8 | PQC 未集成主应用 | ⚠️ GAP (Low) |

**总体结论**: TLS 降级攻击面已充分防护。主要风险不在降级，而在 HKDF 实现分歧导致密钥不匹配——这是一个需要立即修复的协议级 bug。

---

## 修复优先级

1. **P0**: 修复客户端 `_hkdfExpand` → 对齐 RFC 5869 HKDF-Expand
2. **P1**: 将 `doHybridExchange()` 集成到消息加密流水线
3. **P2**: 添加集成测试验证 client ↔ server sessionKey 一致性
