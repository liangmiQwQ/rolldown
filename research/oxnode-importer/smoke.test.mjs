import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { createImporter } from './importer.mjs';

test('loads a Vite-shaped config with TypeScript dependencies and callable plugins', async (t) => {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'rolldown-importer-')));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  mkdirSync(join(directory, 'src'));
  const files = {
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        experimentalDecorators: true,
        paths: { '@local/*': ['./src/*'] },
      },
    }),
    'src/value.ts': 'export enum Value { Current = 42 }',
    'sync.mts': 'export const value: number = 7',
    'bridge.cts': 'module.exports = require("./sync.mts").value',
    'dynamic.ts': 'export const value: number = 3',
    'config.mts': `
      import { Value } from '@local/value';
      function decorate<T>(value: T): T { return value }
      @decorate
      class Plugin { config() { return { define: { VALUE: Value.Current } } } }
      const dynamic = await import('./dynamic.ts');
      export default {
        marker: Value.Current,
        directory: __dirname,
        filename: __filename,
        synchronous: require('./bridge.cts'),
        dynamic: dynamic.value,
        plugins: [new Plugin()],
      }
    `,
  };
  for (const [name, source] of Object.entries(files)) {
    writeFileSync(join(directory, name), source);
  }

  // Call the same programmatic API as the Vite+ PoC; no Node loader registration.
  const importer = createImporter(pathToFileURL(join(directory, 'caller.mjs')), {
    moduleCache: false,
  });
  const config = await importer.import('./config.mts', { default: true });
  assert.equal(config.marker, 42);
  assert.equal(config.directory, directory);
  assert.equal(config.filename, join(directory, 'config.mts'));
  assert.equal(config.synchronous, 7);
  assert.equal(config.dynamic, 3);
  assert.deepEqual(config.plugins[0].config(), { define: { VALUE: 42 } });
});
