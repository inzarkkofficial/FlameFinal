import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const isWindows = process.platform === "win32";
const runApkBuild = process.argv.includes("--apk");
const apiUrl = process.env.VITE_API_URL || "https://flamefinal.onrender.com/api";
const socketUrl = process.env.VITE_SOCKET_URL || apiUrl.replace(/\/api\/?$/, "");

function command(name) {
  return isWindows ? `${name}.cmd` : name;
}

function run(label, cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: isWindows,
    ...options,
    env: {
      ...process.env,
      ...options.env
    }
  });

  if (result.status !== 0) {
    process.exitCode = result.status || 1;
    throw new Error(`${label} failed.`);
  }
}

function firstExisting(paths) {
  return paths.find((path) => path && existsSync(path));
}

const localJavaHome = firstExisting([
  join(root, "tools", "jdk21"),
  join(root, "tools", "jdk"),
  join(root, "tools", "temurin-jdk")
]);
const localAndroidHome = firstExisting([
  join(root, "tools", "android-sdk")
]);
const env = {
  VITE_API_URL: apiUrl,
  VITE_SOCKET_URL: socketUrl
};

if (!process.env.JAVA_HOME && localJavaHome) env.JAVA_HOME = localJavaHome;
if (!process.env.ANDROID_HOME && localAndroidHome) env.ANDROID_HOME = localAndroidHome;
if (!process.env.ANDROID_SDK_ROOT && localAndroidHome) env.ANDROID_SDK_ROOT = localAndroidHome;

console.log(`Building Android web assets against ${apiUrl}`);
run("Frontend build", command("npm"), ["run", "build", "--workspace", "flame-frontend"], { env });
run("Capacitor sync", command("npx"), ["cap", "sync", "android"], { env });

if (runApkBuild) {
  const gradle = isWindows ? "gradlew.bat" : "./gradlew";
  run("Android APK build", gradle, ["assembleDebug"], {
    cwd: join(root, "android"),
    env
  });
}
