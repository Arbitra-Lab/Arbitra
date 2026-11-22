import { execFileSync } from "node:child_process";
import path from "node:path";

const frontendRoot = path.resolve("frontend");
const files = process.argv
  .slice(2)
  .map((file) => path.relative(frontendRoot, path.resolve(file)))
  .filter((file) => !file.startsWith("..") && !path.isAbsolute(file));

if (files.length === 0) {
  process.exit(0);
}

execFileSync(
  "pnpm",
  ["--dir", "frontend", "exec", "eslint", "--fix", ...files],
  {
    stdio: "inherit",
  },
);
