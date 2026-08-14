import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerRoot = path.resolve(extensionRoot, "..", "runtime-worker");
const runtimeWorkerBundle = path.join(workerRoot, "dist", "bundle.mjs");
const vendorScope = path.join(extensionRoot, ".cache", "keyring-platforms", "@napi-rs");

export const REQUIRED_KEYRING_BINDINGS = [
  "keyring-darwin-arm64",
  "keyring-darwin-x64",
  "keyring-linux-arm64-gnu",
  "keyring-linux-x64-gnu",
  "keyring-win32-arm64-msvc",
  "keyring-win32-x64-msvc"
];

function createWorkerRequire() {
  return createRequire(runtimeWorkerBundle);
}

function keyringVersion() {
  const requireFromWorker = createWorkerRequire();
  const packageJson = requireFromWorker.resolve("@napi-rs/keyring/package.json");
  return JSON.parse(readFileSync(packageJson, "utf8")).version;
}

function hasNativeBinary(packageDir) {
  return existsSync(packageDir) && readdirSync(packageDir).some((entry) => entry.endsWith(".node"));
}

function resolveInstalledPlatformDir(name) {
  try {
    const requireFromWorker = createWorkerRequire();
    return path.dirname(requireFromWorker.resolve(`@napi-rs/${name}/package.json`));
  } catch {
    return null;
  }
}

function vendorPlatformDir(name) {
  return path.join(vendorScope, name);
}

async function downloadTarball(packageName, version, outputPath) {
  const tarballName = `${packageName.split("/")[1]}-${version}.tgz`;
  const url = `https://registry.npmjs.org/${packageName}/-/${tarballName}`;
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  writeFileSync(outputPath, Buffer.from(await response.arrayBuffer()));
}

function extractTarball(tarballPath, destDir) {
  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });
  execFileSync("tar", ["-xzf", tarballPath, "-C", destDir, "--strip-components=1"], {
    stdio: "pipe"
  });
}

export async function ensureKeyringPlatforms() {
  if (!existsSync(runtimeWorkerBundle)) {
    throw new Error(
      `Missing ${runtimeWorkerBundle}. Run: pnpm --filter @vindicate/runtime-worker run build:bundle`
    );
  }

  const version = keyringVersion();
  mkdirSync(vendorScope, { recursive: true });

  for (const name of REQUIRED_KEYRING_BINDINGS) {
    const installedDir = resolveInstalledPlatformDir(name);
    if (installedDir && hasNativeBinary(installedDir)) {
      continue;
    }

    const vendorDir = vendorPlatformDir(name);
    if (hasNativeBinary(vendorDir)) {
      continue;
    }

    const packageName = `@napi-rs/${name}`;
    const stagingDir = path.join(extensionRoot, ".cache", "keyring-pack", name);
    rmSync(stagingDir, { recursive: true, force: true });
    const tarballPath = path.join(stagingDir, `${name}.tgz`);
    await downloadTarball(packageName, version, tarballPath);
    extractTarball(tarballPath, vendorDir);

    if (!hasNativeBinary(vendorDir)) {
      throw new Error(`Downloaded ${packageName}@${version} but no .node binary was found`);
    }
  }
}

export function resolvePlatformPackageDir(name) {
  const installedDir = resolveInstalledPlatformDir(name);
  if (installedDir && hasNativeBinary(installedDir)) {
    return installedDir;
  }

  const vendorDir = vendorPlatformDir(name);
  if (hasNativeBinary(vendorDir)) {
    return vendorDir;
  }

  throw new Error(`Missing @napi-rs/${name} with a native .node binary`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await ensureKeyringPlatforms();
  console.log(`Ensured ${REQUIRED_KEYRING_BINDINGS.length} @napi-rs/keyring platform packages`);
}
