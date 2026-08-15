import { createRequire } from "node:module";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureKeyringPlatforms,
  REQUIRED_KEYRING_BINDINGS,
  resolvePlatformPackageDir
} from "./ensure-keyring-platforms.mjs";

const extensionRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workerRoot = path.resolve(extensionRoot, "..", "runtime-worker");

const runtimeWorkerBundle = path.join(workerRoot, "dist", "bundle.mjs");

function createWorkerRequire() {
  return createRequire(runtimeWorkerBundle);
}

function copyNapiKeyringScope(destScope) {
  const requireFromWorker = createWorkerRequire();
  const packages = ["keyring", ...REQUIRED_KEYRING_BINDINGS];

  mkdirSync(destScope, { recursive: true });

  for (const name of packages) {
    const packageDir =
      name === "keyring"
        ? path.dirname(requireFromWorker.resolve("@napi-rs/keyring/package.json"))
        : resolvePlatformPackageDir(name);
    const destDir = path.join(destScope, name);
    rmSync(destDir, { recursive: true, force: true });
    cpSync(packageDir, destDir, { recursive: true, force: true });
  }
}

const runtimeWorkerChromiumBidi = path.join(workerRoot, "node_modules", "chromium-bidi");
const runtimeWorkerPlaywrightBrowsersJson = path.join(
  workerRoot,
  "node_modules",
  "playwright-core",
  "browsers.json"
);
const runtimeWorkerPackageJson = path.join(workerRoot, "package.json");

function requireFile(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(
      `Required build artifact missing: ${filePath}\n` +
        "Run: pnpm --filter @vindicate/runtime-worker run build:bundle"
    );
  }
}

function requireDir(dirPath) {
  if (!existsSync(dirPath)) {
    throw new Error(`Required directory missing: ${dirPath}`);
  }
}

requireFile(runtimeWorkerBundle);
requireDir(runtimeWorkerChromiumBidi);
requireFile(runtimeWorkerPlaywrightBrowsersJson);
requireFile(runtimeWorkerPackageJson);
await ensureKeyringPlatforms();

const workerRuntimeDir = path.resolve(extensionRoot, "dist", "bundled", "runtime-worker");
rmSync(workerRuntimeDir, { recursive: true, force: true });
mkdirSync(workerRuntimeDir, { recursive: true });

const workerOutputDir = path.resolve(workerRuntimeDir, "node_modules", "@napi-rs");
mkdirSync(path.dirname(workerOutputDir), { recursive: true });
copyFileSync(runtimeWorkerBundle, path.join(workerRuntimeDir, "bundle.mjs"));
copyNapiKeyringScope(workerOutputDir);

const chromiumBidiOut = path.join(workerRuntimeDir, "node_modules", "chromium-bidi");
rmSync(chromiumBidiOut, { recursive: true, force: true });
cpSync(runtimeWorkerChromiumBidi, chromiumBidiOut, {
  recursive: true,
  force: true,
  dereference: true
});

const chromiumBidiMapperShim = path.join(
  chromiumBidiOut,
  "lib",
  "cjs",
  "bidiMapper",
  "BidiMapper.js"
);
const chromiumCdpShim = path.join(chromiumBidiOut, "lib", "cjs", "cdp", "CdpConnection.js");
mkdirSync(path.dirname(chromiumBidiMapperShim), { recursive: true });
mkdirSync(path.dirname(chromiumCdpShim), { recursive: true });
writeFileSync(
  chromiumBidiMapperShim,
  "module.exports = require('../../bidiMapper/BidiMapper.js');\n"
);
writeFileSync(chromiumCdpShim, "module.exports = require('../../cdp/CdpConnection.js');\n");

const bundledDir = path.resolve(extensionRoot, "dist", "bundled");
mkdirSync(bundledDir, { recursive: true });

copyFileSync(runtimeWorkerPlaywrightBrowsersJson, path.resolve(bundledDir, "browsers.json"));

// playwright-core resolves packageRoot as dirname(bundle.mjs)/.. and requires package.json there.
writeFileSync(
  path.resolve(bundledDir, "package.json"),
  JSON.stringify(
    {
      name: "vindicate-bundled-runtimes",
      version: "0.0.0"
    },
    null,
    2
  )
);

const runtimeWorkerPackage = JSON.parse(readFileSync(runtimeWorkerPackageJson, "utf8"));
writeFileSync(
  path.resolve(extensionRoot, "dist", "package.json"),
  JSON.stringify(
    {
      name: "vindicate-runtime-worker-metadata",
      version: runtimeWorkerPackage.version ?? "0.0.0"
    },
    null,
    2
  )
);

console.log(
  `Copied runtime-worker bundle into dist/bundled/runtime-worker/ (${REQUIRED_KEYRING_BINDINGS.length} keyring platforms)`
);
