/**
 * Entry point for `node --import`. Registers the `@/*` and extensionless-relative resolution
 * hooks (see alias-hooks.mjs) on the loader thread so they apply to every module the test
 * files import. Mirrors `backend/test/register-hooks.mjs`.
 */
import { register } from "node:module";
import { pathToFileURL } from "node:url";

register("./alias-hooks.mjs", pathToFileURL(import.meta.filename));
