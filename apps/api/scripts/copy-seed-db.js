const fs = require('fs');
const path = require('path');

const src = path.resolve(__dirname, '../prisma/seed.db');
const destDir = path.resolve(__dirname, '../dist/prisma');
const dest = path.join(destDir, 'seed.db');

if (fs.existsSync(src)) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`[copy-seed-db] Copied seed database to ${dest}`);
} else {
  console.warn(`[copy-seed-db] Source seed database not found at ${src}`);
}
