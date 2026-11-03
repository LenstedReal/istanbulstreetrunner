// Lets `node --test` run the pure TypeScript game modules: resolves the "@/" path
// alias and extensionless imports the way Metro and tsconfig do.
import { register } from "node:module";

register("./resolve-hook.mjs", import.meta.url);
