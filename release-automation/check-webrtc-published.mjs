#!/usr/bin/env node
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const submoduleDir = resolve(repoRoot, "packages/react-native-webrtc");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

let head;
try {
  head = execSync(`git -C "${submoduleDir}" rev-parse HEAD`, {
    stdio: ["ignore", "pipe", "pipe"],
  })
    .toString()
    .trim();
} catch {
  fail(
    `Could not read git HEAD of the react-native-webrtc submodule at ${submoduleDir}.\n` +
      `Make sure the submodule is initialized: \`git submodule update --init --recursive\`.`,
  );
}

let tagAtHead;
try {
  tagAtHead = execSync(
    `git -C "${submoduleDir}" describe --exact-match --tags ${head}`,
    { stdio: ["ignore", "pipe", "pipe"] },
  )
    .toString()
    .trim();
} catch {
  fail(
    `Submodule HEAD (${head.slice(0, 7)}) is not at a tagged release of @fishjam-cloud/react-native-webrtc.\n` +
      `Pin the submodule to a release tag (e.g. v0.27.0) before publishing mobile-client.\n` +
      `Tip: \`git -C packages/react-native-webrtc fetch --tags && git -C packages/react-native-webrtc checkout v<version>\`.`,
  );
}

const pkg = JSON.parse(
  readFileSync(resolve(submoduleDir, "package.json"), "utf8"),
);
const { name, version } = pkg;

if (tagAtHead !== version && tagAtHead !== `v${version}`) {
  fail(
    `Submodule HEAD tag (${tagAtHead}) does not match the workspace version (${version}).\n` +
      `Expected tag "${version}" or "v${version}". Check out the matching release tag and recommit the submodule sha.`,
  );
}

let npmVersions;
try {
  const raw = execSync(`npm view ${name} versions --json`).toString();
  const parsed = JSON.parse(raw);
  npmVersions = Array.isArray(parsed) ? parsed : [parsed];
} catch (err) {
  fail(`Failed to query npm for ${name}: ${err.message}`);
}

if (!npmVersions.includes(version)) {
  fail(
    `Version ${version} of ${name} is not published to npm.\n` +
      `Publish ${name}@${version} (from the webrtc repo) before publishing mobile-client.`,
  );
}

console.log(
  `OK: submodule at tag ${tagAtHead} (${name}@${version} is published to npm).`,
);
