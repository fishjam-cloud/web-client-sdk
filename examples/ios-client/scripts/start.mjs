// Compiles the Rust core, regenerates the Xcode projects, builds
// FishjamExample, and runs it on a device or simulator.
// Run with `yarn start` from examples/ios-client.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bundleId,
  capture,
  requireEnv,
  run,
  selectDevice,
  sortDevices,
  startExample,
} from "../../shared/start-example.mjs";

const exampleDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

async function bootedSimulatorIds() {
  const output = await capture("xcrun", [
    "simctl",
    "list",
    "devices",
    "booted",
    "-j",
  ]);
  const listed = JSON.parse(output);
  const ids = new Set();
  for (const devices of Object.values(listed.devices ?? {})) {
    for (const device of devices) ids.add(device.udid);
  }
  return ids;
}

async function listIosDevices() {
  const [output, booted] = await Promise.all([
    capture("xcrun", ["xcdevice", "list"]),
    bootedSimulatorIds(),
  ]);
  const start = output.indexOf("[");
  const end = output.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("Could not read the device list from xcdevice.");
  }

  const listed = JSON.parse(output.slice(start, end + 1));
  const devices = [];
  for (const device of listed) {
    const iphone =
      device.platform === "com.apple.platform.iphoneos" ||
      device.platform === "com.apple.platform.iphonesimulator";
    if (!iphone || device.available !== true || device.ignored === true)
      continue;

    const version = String(device.operatingSystemVersion ?? "").split(" ")[0];
    const kind = device.simulator ? "simulator" : "device";
    const versionLabel = version ? `, iOS ${version}` : "";
    const simulator = device.simulator === true;
    devices.push({
      id: device.identifier,
      name: device.name,
      simulator,
      booted: simulator && booted.has(device.identifier),
      label: `${device.name} (${kind}${versionLabel})`,
    });
  }

  if (devices.length === 0) {
    throw new Error(
      "No iPhone or iPad is available. Open a simulator or plug in a phone, then run this again.",
    );
  }
  return sortDevices(devices);
}

async function runIos({ query, prompt }) {
  requireEnv();
  const device = await selectDevice(await listIosDevices(), { query, prompt });
  const destination = device.simulator
    ? `platform=iOS Simulator,id=${device.id}`
    : `platform=iOS,id=${device.id}`;
  const sdk = device.simulator ? "iphonesimulator" : "iphoneos";
  const app = path.join(
    exampleDir,
    "build/DerivedData/Build/Products",
    `Debug-${sdk}`,
    "FishjamExample.app",
  );

  console.log(
    "\n1/4  Compiling the Rust core and regenerating the Xcode projects",
  );
  await run("yarn", ["prepare:project"], {
    cwd: exampleDir,
    label: "Compiling the Rust core and regenerating the Xcode projects",
  });

  console.log("\n2/4  Building FishjamExample");
  await run(
    "xcodebuild",
    [
      "build",
      "-project",
      "FishjamExample.xcodeproj",
      "-scheme",
      "FishjamExample",
      "-destination",
      destination,
      "-derivedDataPath",
      "build/DerivedData",
      "-allowProvisioningUpdates",
    ],
    { cwd: exampleDir, label: "Building FishjamExample" },
  );

  if (!existsSync(app)) {
    throw new Error(`The build finished but ${app} is missing.`);
  }

  console.log(`\n3/4  Installing on ${device.name}`);
  if (device.simulator) {
    await run("xcrun", ["simctl", "bootstatus", device.id, "-b"], {
      label: `Booting ${device.name}`,
    });
    await run("open", ["-a", "Simulator"]);
    await run("xcrun", ["simctl", "install", device.id, app], {
      label: `Installing on ${device.name}`,
    });
    console.log("\n4/4  Launching FishjamExample");
    await run("xcrun", ["simctl", "terminate", device.id, bundleId], {
      allowFailure: true,
    });
    await run("xcrun", ["simctl", "launch", device.id, bundleId], {
      label: "Launching FishjamExample",
    });
  } else {
    await run(
      "xcrun",
      ["devicectl", "device", "install", "app", "--device", device.id, app],
      {
        label: `Installing on ${device.name}`,
      },
    );
    console.log("\n4/4  Launching FishjamExample");
    await run(
      "xcrun",
      [
        "devicectl",
        "device",
        "process",
        "launch",
        "--terminate-existing",
        "--device",
        device.id,
        bundleId,
      ],
      { label: "Launching FishjamExample" },
    );
  }

  console.log(`\nFishjamExample is running on ${device.label}.`);
}

await startExample({ platform: "ios", start: runIos });
