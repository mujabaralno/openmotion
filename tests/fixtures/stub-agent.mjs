import { spawn } from "node:child_process";
import fs from "node:fs";

const pidFileIndex = process.argv.indexOf("--pid-file");
const pidFile =
  pidFileIndex >= 0 ? process.argv[pidFileIndex + 1] : null;

const grandchild = spawn(
  process.execPath,
  ["-e", "setInterval(() => {}, 1000)"],
  { stdio: "ignore" },
);

if (pidFile) {
  fs.writeFileSync(
    pidFile,
    JSON.stringify({
      parent: process.pid,
      grandchild: grandchild.pid,
      cwd: process.cwd(),
    }),
    "utf8",
  );
}

setInterval(() => {}, 1000);
