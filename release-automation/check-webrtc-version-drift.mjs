#!/usr/bin/env node
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const require = createRequire(import.meta.url);
const semver = require("semver");

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const webrtcPkg = JSON.parse(
  readFileSync(
    resolve(repoRoot, "packages/react-native-webrtc/package.json"),
    "utf8",
  ),
);
const mobilePkg = JSON.parse(
  readFileSync(
    resolve(repoRoot, "packages/mobile-client/package.json"),
    "utf8",
  ),
);

const workspaceVersion = webrtcPkg.version;
const peerRange =
  mobilePkg.peerDependencies?.["@fishjam-cloud/react-native-webrtc"];

if (!workspaceVersion) {
  console.error("Missing version in packages/react-native-webrtc/package.json");
  process.exit(1);
}
if (!peerRange) {
  console.error(
    'Missing peerDependencies."@fishjam-cloud/react-native-webrtc" in packages/mobile-client/package.json',
  );
  process.exit(1);
}

if (!semver.satisfies(workspaceVersion, peerRange)) {
  console.error(
    `Version drift: react-native-webrtc workspace is ${workspaceVersion} but mobile-client peerDependencies range is "${peerRange}".`,
  );
  console.error(
    "Update the submodule sha or the peerDependencies range so they agree.",
  );
  process.exit(1);
}

console.log(
  `OK: react-native-webrtc ${workspaceVersion} satisfies peer range "${peerRange}".`,
);
