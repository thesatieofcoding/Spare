import { readFile } from "node:fs/promises";
import { main } from "./cli.js";
import { composeReal } from "./compose.js";

process.exitCode = await main(process.argv.slice(2), {
  readFile: (p) => readFile(p, "utf8"),
  compose: composeReal,
  env: process.env,
  log: (l) => console.log(l),
});
