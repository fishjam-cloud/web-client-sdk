// Compiles the Rust core, builds and installs FishjamExample, and runs it
// on an emulator or phone.
// Run with `yarn start` from examples/android-client.

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

async function listAndroidDevices() {
  const output = await capture("adb", ["devices", "-l"]);
  const devices = [];
  const blocked = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("List of devices")) continue;
    const match = /^(\S+)\s+(\S+)(?:\s+(.*))?$/.exec(trimmed);
    if (!match) continue;

    const [, id, state, details = ""] = match;
    if (state !== "device") {
      blocked.push(`${id} (${state})`);
      continue;
    }

    const model = /(?:^|\s)model:(\S+)/
      .exec(details)?.[1]
      ?.replaceAll("_", " ");
    const name = model || id;
    const simulator = id.startsWith("emulator-");
    devices.push({
      id,
      name,
      simulator,
      booted: simulator,
      label: model ? `${name} (${id})` : id,
    });
  }

  if (devices.length === 0) {
    if (blocked.length > 0) {
      throw new Error(
        `Android devices are connected but not ready: ${blocked.join(", ")}. Unlock the phone and accept the USB debugging prompt, then run this again.`,
      );
    }
    throw new Error(
      "No Android device is connected. Start an emulator or plug in a phone, then run this again.",
    );
  }
  return sortDevices(devices);
}

async function runAndroid({ query, prompt }) {
  requireEnv();
  const device = await selectDevice(await listAndroidDevices(), {
    query,
    prompt,
  });
  const env = { ...process.env, ANDROID_SERIAL: device.id };
  const gradlew = path.join(exampleDir, "gradlew");

  console.log("\n1/3  Compiling the Rust core");
  await run(gradlew, [":client:buildFishjamCore", "--console=plain"], {
    cwd: exampleDir,
    env,
    label: "Compiling the Rust core",
  });

  console.log("\n2/3  Building the example and installing it");
  await run(gradlew, [":app:installDebug", "--console=plain"], {
    cwd: exampleDir,
    env,
    label: "Building and installing the example",
  });

  console.log("\n3/3  Launching FishjamExample");
  await run(
    "adb",
    [
      "-s",
      device.id,
      "shell",
      "am",
      "start",
      "-n",
      `${bundleId}/.MainActivity`,
    ],
    {
      label: "Launching FishjamExample",
    },
  );

  console.log(`\nFishjamExample is running on ${device.label}.`);
}

await startExample({ platform: "android", start: runAndroid });
