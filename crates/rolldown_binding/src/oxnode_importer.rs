// Measurement-only embedding; see internal-docs/oxnode-importer-size/implementation.md.
use napi::{Env, Result, bindgen_prelude::*};
use napi_derive::napi;
use oxc_node::{ModuleRunnerOutput, OxcResolveOptions, ResolveContext, ResolveFnOutput};

#[napi(module_exports)]
fn initialize(exports: Object, env: Env) -> Result<()> {
  oxc_node::detect_runtime_syntax(exports, env)
}

#[napi]
fn importer_transform(
  env: Env,
  path: String,
  source: Either<String, &[u8]>,
  sync: Option<bool>,
) -> Result<ModuleRunnerOutput> {
  oxc_node::transform_module_runner_js(env, path, source, sync)
}

#[napi]
fn importer_transforms_dep(env: Env, path: String) -> Result<bool> {
  oxc_node::transforms_dep_js(env, path)
}

#[napi]
fn importer_resolve<'env>(
  env: &'env Env,
  options: OxcResolveOptions,
  specifier: String,
  context: ResolveContext,
  next_resolve: Function<
    'env,
    FnArgs<(String, Option<ResolveContext>)>,
    Either<ResolveFnOutput, PromiseRaw<'env, ResolveFnOutput>>,
  >,
) -> Result<Either<ResolveFnOutput, PromiseRaw<'env, ResolveFnOutput>>> {
  oxc_node::create_resolve(env, options, specifier, context, next_resolve)
}
