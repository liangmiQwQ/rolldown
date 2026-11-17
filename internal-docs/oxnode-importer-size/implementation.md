# oxnode importer size experiment

This is a fork-only size experiment, not a production API proposal. It measures the programmatic importer discussed in [vite-plus#3380](https://github.com/voidzero-dev/vite-plus/issues/3380#issuecomment-6874678694). No PR is required. The importer itself already exists upstream ([oxc-node#870](https://github.com/oxc-project/oxc-node/pull/870)); this experiment embeds it into Rolldown instead of reimplementing it.

## Result

Measured on 2026-11-17, macOS 26.6.2, ARM64, Rust 1.100.0. Decimal KB/MB throughout.

| Native binding                             |      Bytes | gzip level 9 bytes |              Change from control |
| ------------------------------------------ | ---------: | -----------------: | -------------------------------: |
| Rolldown control                           | 19,019,920 |          8,462,655 |                                — |
| Importer, upstream Oxc 0.158 / sourcemap 9 | 21,834,272 |          9,621,282 | +2,814,352 raw / +1,158,627 gzip |
| Importer, shared Oxc 0.159 / sourcemap 10  | 19,550,064 |          8,685,444 | **+530,144 raw / +222,789 gzip** |

The shared-dependency native increase is **2.79%**. Sharing versions removes about 2.28 MB of otherwise duplicated native code. The aligned lockfile adds only the `oxc-node` package and its edge from `rolldown_binding`; every other crate was already present.

Additional distribution payload, measured without minifying the importer:

| Component                                       | Unpacked bytes |             Compressed bytes |
| ----------------------------------------------- | -------------: | ---------------------------: |
| Importer JS + declaration + measurement adapter |         34,884 | 10,662 (sum of gzip streams) |
| Complete `@oxc-project/runtime@0.159.0`         |        269,168 |    48,582 (registry tarball) |
| Total increase including native binding         |    **834,196** |         **282,033 estimate** |

Thus a straightforward integration is approximately **0.83 MB installed / 0.28 MB downloaded per platform**. This includes the complete helper package rather than assuming ordinary enum-only configs never need helpers. Rolldown's runtime helper sources already exist for bundling, but they are not currently a published `@oxc-project/runtime/helpers/*` runtime dependency. Exposing/reusing a suitable existing helper surface could avoid some of that extra payload; that optimization was not measured.

Compressed totals are component sums, not a packed Rolldown npm tarball delta. The existing Rolldown JS distribution was not rebuilt; production export wiring, package metadata and JS chunk layout can change the final tarball. Native compression uses Node v24.22.3's zlib 1.3.2.1-motley-285e94b. Different compressors give slightly different deltas (Python's gzip gave about 214 KB for the shared native delta). File bytes are not memory usage or startup latency.

## What was built

- Rolldown base: `1c5d082067b1a6ec461e98d830e5f2a6940f5e95` (1.3.2).
- oxnode source: `oxc-project/oxc-node@76c132c015f024e8b912f4958cb10e7f4091118f`, fetched as an immutable GitHub archive. Other local oxnode and Vite+ checkouts contain user modifications and were not used as build inputs or edited.
- `research/oxnode-importer/vendor` contains that revision's `src/`, `Cargo.toml` and `build.rs`. Its manifest declares MIT. Changes: isolate its Cargo workspace; align Oxc and sourcemap versions; change the two JS-wrapper feature gates to `cfg_attr` so embedders can call the environment-aware wrappers without registering all oxnode exports.
- `crates/rolldown_binding/src/oxnode_importer.rs` forwards only resolve, transform and dependency-policy operations, plus runtime syntax initialization. `default-features = false` avoids oxnode's allocator and automatic NAPI exports. `yarn_pnp` matches Rolldown's resolver build configuration; this does not establish oxnode Yarn PnP compatibility.
- `research/oxnode-importer/importer.mjs` and its declaration come from the same upstream revision. The binding import and helper resolution target are changed, and the repository commit hook formats the JavaScript. The runner installs no global Node loader hooks. Helper imports resolve to `@oxc-project/runtime` instead of requiring a second oxnode package.
- The `oxnode-importer` Cargo feature is opt-in. Existing generated bindings and package exports are untouched. `binding.mjs` loads the measured `.node` directly; this proves the native entry points are linked and callable, not dead-stripped placeholders.

The release settings are the repository's normal `opt-level = 3`, fat LTO, one codegen unit and stripped symbols. Direct Cargo builds were used after checking `just --list`, because this experiment needs feature-on/off native snapshots without regenerating package bindings. The standard package binding builder also invokes the same Cargo package/profile through napi-rs.

## Validation and limits

The feature-off control was rebuilt with the final lockfile: it has exactly the same file size as the pristine upstream baseline. Hashes differ after relinking and gzip differs by 3 bytes; results use the final control. All four hashes and exact measurements are in `research/oxnode-importer/results.json`.

One end-to-end smoke test passed with both embedded builds. It loads a Vite-shaped config through `createImporter`, checking TypeScript enum dependencies, tsconfig paths, decorator runtime helpers, `__filename` / `__dirname`, top-level await, dynamic import, a CommonJS-to-ESM synchronous require chain and a plugin method that remains callable. The only initial test failure was macOS `/var` versus `/private/var` canonicalization; the fixture now uses its real path.

This is not a complete Vite integration or a full oxnode compatibility certification. Windows, Linux, WASI, worker isolation and watch-mode invalidation were not validated. No startup performance claim is made. The measured implementation embeds the upstream resolver/transform logic; a more invasive transplant using existing Rolldown APIs might shrink it further, but saying its native cost is zero would be unsupported: Rolldown's current module-runner API does not expose all importer-required synchronous/CommonJS behavior.

## Reproduce

Use this fork branch and the recorded toolchain. From the repository root, choose an absolute snapshot directory and run:

```sh
mkdir -p /tmp/rolldown-importer-study
just --list
cargo build --release --locked -p rolldown_binding
cp target/release/librolldown_binding.dylib /tmp/rolldown-importer-study/control.node
cp /tmp/rolldown-importer-study/control.node /tmp/rolldown-importer-study/baseline.node
cargo build --release --locked -p rolldown_binding --features oxnode-importer
cp target/release/librolldown_binding.dylib /tmp/rolldown-importer-study/aligned.node
```

For the unaligned variant, temporarily change **only** the vendored manifest's Oxc version to `0.158.0` and sourcemap to `9`. Run the feature-enabled build without `--locked`, save the result as `unaligned.node`, then restore those two values and rebuild to restore the aligned lockfile. Keep the same release options. The original pristine baseline can instead be built at the recorded base commit in a normal checkout; no worktree is needed.

Install just the helper package into the experiment's ignored `node_modules` directory, then test and measure:

```sh
curl -fsSL https://registry.npmjs.org/@oxc-project/runtime/-/runtime-0.159.0.tgz -o /tmp/rolldown-importer-study/runtime.tgz
mkdir -p research/oxnode-importer/node_modules/@oxc-project/runtime
tar -xzf /tmp/rolldown-importer-study/runtime.tgz --strip-components=1 -C research/oxnode-importer/node_modules/@oxc-project/runtime
ROLLDOWN_IMPORTER_BINDING=/tmp/rolldown-importer-study/aligned.node node --test research/oxnode-importer/smoke.test.mjs
node research/oxnode-importer/measure.mjs /tmp/rolldown-importer-study
```

The absolute addon path is a measurement convenience, not the intended public API. A real integration would add a lazy `rolldown/importer` entry, generate binding declarations normally, and have Vite invoke it when loading config. Vite already depends on Rolldown, so this route does not require another standalone native oxnode addon.
