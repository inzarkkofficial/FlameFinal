import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath?.endsWith(".js") ? process.env.npm_execpath : "";
const SITE_URL = `http://localhost:${process.env.PORT || "4000"}`;
const children = [];
let shuttingDown = false;

function npmArgs(args) {
  return npmCli ? [npmCli, ...args] : args;
}

function command() {
  return npmCli ? process.execPath : npmCommand;
}

function run(name, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command(), npmArgs(args), {
      cwd: process.cwd(),
      stdio: "inherit",
      shell: process.platform === "win32" && !npmCli
    });

    child.on("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`${name} stopped (${signal}).`));
        return;
      }
      if (code) {
        reject(new Error(`${name} failed with code ${code}.`));
        return;
      }
      resolve();
    });
  });
}

async function isReachable(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1200);
  try {
    const response = await fetch(url, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function start(name, args) {
  const child = spawn(command(), npmArgs(args), {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: process.platform === "win32" && !npmCli
  });

  children.push(child);

  child.on("exit", (code, signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.error(`${name} stopped${signal ? ` (${signal})` : code ? ` with code ${code}` : ""}.`);
    stopChildren();
    process.exit(code || 1);
  });

  return child;
}

function stopChildren() {
  for (const child of children) {
    if (!child.killed) child.kill("SIGINT");
  }
}

process.on("SIGINT", () => {
  shuttingDown = true;
  stopChildren();
});

process.on("SIGTERM", () => {
  shuttingDown = true;
  stopChildren();
});

await run("Frontend build", ["run", "build", "--workspace", "flame-frontend"]);

const backendRunning = await isReachable(`${SITE_URL}/api/health`);

if (backendRunning) {
  console.log(`Flame is already running at ${SITE_URL}`);
  console.log(`Open one link only: ${SITE_URL}`);
} else {
  console.log(`Starting Flame on one port: ${SITE_URL}`);
  start("Flame", ["run", "dev:backend"]);
}
