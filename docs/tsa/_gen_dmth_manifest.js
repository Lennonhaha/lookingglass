const fs = require('fs');
const crypto = require('crypto');
const files = [
  'D:/FIBEMATE/lookingglass/paper/paper_main.tex',
  'D:/FIBEMATE/lookingglass/paper/paper_main.pdf',
  'D:/FIBEMATE/07_Electron_D盘原/README.md',
  'D:/FIBEMATE/02_项目档案_E盘/01_最终交付/FIBEMATE_最终项目/ARCHITECTURE.md',
  'D:/FIBEMATE/07_Electron_D盘原/src/modules/pqc-init.js',
  'D:/FIBEMATE/07_Electron_D盘原/src/modules/lg-keyexchange.js'
];
let manifest = {title:'DMH→DMTH 全链修正 2026-06-26', files:[]};
for (let f of files) {
  let buf = fs.readFileSync(f);
  let hash = crypto.createHash('sha256').update(buf).digest('hex');
  manifest.files.push({path:f, sha256:hash, size:buf.length});
}
fs.writeFileSync('D:/FIBEMATE/lookingglass/docs/tsa/dmth-correct-manifest.json', JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
