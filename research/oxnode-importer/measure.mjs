import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const directory = process.argv[2];
if (!directory) throw new Error('Usage: node measure.mjs /path/to/binary-snapshots');
const root = fileURLToPath(new URL('.', import.meta.url));
const size = (bytes) => ({
  bytes: bytes.length,
  gzip9: gzipSync(bytes, { level: 9 }).length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
});
const binaries = Object.fromEntries(
  ['baseline', 'control', 'unaligned', 'aligned'].map((name) => [
    name,
    size(readFileSync(join(directory, `${name}.node`))),
  ]),
);
const delta = (name) => ({
  bytes: binaries[name].bytes - binaries.control.bytes,
  gzip9: binaries[name].gzip9 - binaries.control.gzip9,
  percent: 100 * (binaries[name].bytes / binaries.control.bytes - 1),
});
const javascript = Object.fromEntries(
  ['importer.mjs', 'importer.d.mts', 'binding.mjs'].map((name) => [
    name,
    size(readFileSync(join(root, name))),
  ]),
);
const runtimeRoot = join(root, 'node_modules/@oxc-project/runtime');
const runtimeFiles = readdirSync(runtimeRoot, { recursive: true })
  .map((name) => join(runtimeRoot, name))
  .filter((name) => statSync(name).isFile());
const runtime = {
  version: JSON.parse(readFileSync(join(runtimeRoot, 'package.json'), 'utf8')).version,
  archiveBytes: statSync(join(directory, 'runtime.tgz')).size,
  unpackedBytes: runtimeFiles.reduce((total, name) => total + statSync(name).size, 0),
};
// These are component sums, not an npm tarball measurement or an RSS measurement.
const totals = {
  alignedUnpackedIncrement:
    delta('aligned').bytes +
    runtime.unpackedBytes +
    Object.values(javascript).reduce((total, entry) => total + entry.bytes, 0),
  alignedCompressedIncrementEstimate:
    delta('aligned').gzip9 +
    runtime.archiveBytes +
    Object.values(javascript).reduce((total, entry) => total + entry.gzip9, 0),
};
console.log(
  JSON.stringify(
    {
      platform: process.platform,
      architecture: process.arch,
      node: process.version,
      compression: `gzip level 9, zlib ${process.versions.zlib}`,
      binaries,
      deltas: { aligned: delta('aligned'), unaligned: delta('unaligned') },
      javascript,
      runtime,
      totals,
    },
    null,
    2,
  ),
);
