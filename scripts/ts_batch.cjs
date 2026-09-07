// ts_manifest.js — 从 manifest 读取文件，批量生成 TSQ 并提交 DigiCert TSA
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');
const http = require('http');

const BASE = 'D:\\FIBEMATE\\lookingglass';

// Parse command line: node ts_batch.cjs lg-015 lg-016
const ONLY = process.argv.slice(2);
const TSA_URL = 'http://timestamp.digicert.com';
const OUT_DIR = path.join(BASE, 'docs', 'tsa');
const OPENSSL = 'C:\\Program Files\\OpenSSL-Win64\\bin\\openssl.exe';

fs.mkdirSync(OUT_DIR, { recursive: true });

const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, 'timestamp-manifest.json'), 'utf-8'));

async function submitTSQ(tsqPath, tsrPath) {
  return new Promise((resolve, reject) => {
    const tsq = fs.readFileSync(tsqPath);
    const url = new URL(TSA_URL);
    const mod = url.protocol === 'https:' ? https : http;
    const opts = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/timestamp-query', 'Content-Length': tsq.length },
      timeout: 15000,
    };
    const req = mod.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        fs.writeFileSync(tsrPath, Buffer.concat(chunks));
        resolve({ status: 'OK', size: Buffer.concat(chunks).length });
      });
    });
    req.on('error', e => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    req.write(tsq);
    req.end();
  });
}

async function main() {
  const results = [];

  for (const f of manifest.files.filter(x => ONLY.length === 0 || ONLY.includes(x.id))) {
    const filePath = path.join(BASE, f.path);
    const tsqPath = path.join(OUT_DIR, `${f.id}.tsq`);
    const tsrPath = path.join(OUT_DIR, `${f.id}.tsr`);

    if (!fs.existsSync(filePath)) {
      console.log(`${f.id} SKIP (file missing: ${f.path})`);
      results.push({ id: f.id, status: 'SKIP' });
      continue;
    }

    try {
      // Step 1: Generate TSQ
      execSync(`"${OPENSSL}" ts -query -data "${filePath}" -no_nonce -sha256 -out "${tsqPath}"`, { stdio: 'pipe' });

      // Step 2: Submit to TSA
      const r = await submitTSQ(tsqPath, tsrPath);
      console.log(`${f.id} ${r.status}  (${r.size}B TSR)`);
      results.push({ id: f.id, status: r.status, tsr_bytes: r.size });
    } catch (e) {
      console.log(`${f.id} FAILED: ${e.message}`);
      results.push({ id: f.id, status: 'FAILED', error: e.message });
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 300));
  }

  console.log(`\n=== SUMMARY ===`);
  results.forEach(r => console.log(`${r.id}: ${r.status}`));

  // Write result log
  const logPath = path.join(OUT_DIR, `tsa-batch_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\nLog: ${logPath}`);
}

main().catch(e => { console.error(e); process.exit(1); });
