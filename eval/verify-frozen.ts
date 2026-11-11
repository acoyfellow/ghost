import { currentHashes, readFrozen } from "./freeze.ts";

const frozen = readFrozen();

if (frozen === null) {
  console.error("eval/frozen.json missing or invalid");
  process.exit(1);
}

const current = currentHashes();
const drift = Object.entries(frozen.hashes).filter(([path, hash]) => current[path] !== hash);

for (const [path] of drift) console.error(`frozen file changed: ${path}`);

if (drift.length > 0) process.exit(1);

console.log(`frozen: ${Object.keys(frozen.hashes).length} files match`);
