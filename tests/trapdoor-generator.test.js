/**
 * LookingGlass: Trapdoor Generator Tests
 */

const { TrapdoorGenerator } = require('../src/trapdoor/trapdoor-generator');
const { TensorOps } = require('../src/core/tensor-ops');

describe('TrapdoorGenerator', () => {
  beforeAll(() => { TensorOps.MOD = 3329n; });

  describe('陷门生成', () => {
    test('生成完整的密钥对', () => {
      const gen = new TrapdoorGenerator({ n: 16, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      expect(kp.publicKey.A).toBeDefined();
      expect(kp.publicKey.b).toBeDefined();
      expect(kp.privateKey.s).toBeDefined();
      expect(kp.privateKey.trapdoorStack).toBeDefined();
      expect(kp.tensorKey.A_tensor).toBeDefined();
    });

    test('密钥维度: A 为 m×n', () => {
      const gen = new TrapdoorGenerator({ n: 16, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      expect(kp.publicKey.A.length).toBe(32);
      expect(kp.publicKey.A[0].length).toBe(16);
    });

    test('陷门栈深度与配置一致', () => {
      const gen = new TrapdoorGenerator({ n: 16, q: 3329n, sigma: 1.0, depth: 3 });
      expect(gen.generate().privateKey.trapdoorStack.length).toBe(3);
    });
  });

  describe('加密-解密循环', () => {
    test('解密保持维度一致性', () => {
      const gen = new TrapdoorGenerator({ n: 8, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      // A_tensor = kron(A, I2): 32 rows × 16 cols
      // Encryption: msg (len=rows) → matMul → ct (len=cols)
      // Decryption: ct (len=cols) → dec (same len) — verify round-trip retains dim
      const cols = kp.tensorKey.A_tensor[0].length;
      const pt = Array.from({ length: kp.tensorKey.A_tensor.length }, () =>
        BigInt(Math.floor(Math.random() * 3329)));
      const ct = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
      const dec = gen.decaps(ct, kp.privateKey);
      // Decrypt output length = ciphertext length = cols of A_tensor
      expect(dec.length).toBe(cols);
      expect(ct.length).toBe(cols);
    });

    test('多次循环解密一致', () => {
      const gen = new TrapdoorGenerator({ n: 8, q: 3329n, sigma: 1.0, depth: 2, k: 2 });
      const kp = gen.generate();
      const cols = kp.tensorKey.A_tensor[0].length;
      const pt = Array.from({ length: kp.tensorKey.A_tensor.length }, () =>
        BigInt(Math.floor(Math.random() * 3329)));
      let consistent = 0;
      for (let r = 0; r < 10; r++) {
        const ct = TensorOps.matMul([pt], kp.tensorKey.A_tensor)[0];
        const dec = gen.decaps(ct, kp.privateKey);
        if (dec.length === cols) consistent++;
      }
      expect(consistent).toBe(10);
    });
  });

  describe('安全评估', () => {
    test('强度随维度增加', () => {
      const r1 = new TrapdoorGenerator({ n: 32, q: 3329n, sigma: 1.0, depth: 2 }).generate().securityReport;
      const r2 = new TrapdoorGenerator({ n: 64, q: 3329n, sigma: 1.0, depth: 2 }).generate().securityReport;
      expect(parseFloat(r2.totalSecurity)).toBeGreaterThan(parseFloat(r1.totalSecurity));
    });

    test('强度随深度增加', () => {
      const r1 = new TrapdoorGenerator({ n: 32, q: 3329n, sigma: 1.0, depth: 1 }).generate().securityReport;
      const r2 = new TrapdoorGenerator({ n: 32, q: 3329n, sigma: 1.0, depth: 3 }).generate().securityReport;
      expect(parseFloat(r2.totalSecurity)).toBeGreaterThan(parseFloat(r1.totalSecurity));
    });
  });
});
