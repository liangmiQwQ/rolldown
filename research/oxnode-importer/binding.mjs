import { createRequire } from 'node:module';

// Load the measured addon directly; the generated package bindings stay untouched.
const binding = createRequire(import.meta.url)(process.env.ROLLDOWN_IMPORTER_BINDING);
export const {
  importerResolve: createResolve,
  importerTransform: transformModuleRunner,
  importerTransformsDep: transformsDep,
} = binding;
