// Shared code for `yarn start` in examples/ios-client and examples/android-client.
// Each platform has its own scripts/start.mjs that calls startExample().

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const bundleId = "io.fishjam.example";

function usage(platform) {
  const folder = `examples/${platform}-client`;
  const sample = platform === "android" ? "emulator-5554" : '"iPhone 17"';

  return `Usage: yarn start [--device [name]]

Compiles the Rust core, regenerates the project, builds the example, and runs it.

A connected phone is used. If no phone is connected, a simulator that is already running is used.
--device with no name prints the list and asks you to pick. A device can be a name or an id.

From ${folder}:

  yarn start
  yarn start --device
  yarn start --device ${sample}

From web-client-sdk:

  yarn workspace @fishjam-example/${platform}-client start
  yarn workspace @fishjam-example/${platform}-client start --device
  yarn workspace @fishjam-example/${platform}-client start --device ${sample}
`;
}

function parseArgs(argv, platform) {
  const args = [...argv];
  const deviceParts = [];
  let prompt = false;
  let help = false;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      help = true;
      continue;
    }
    if (arg === "--device" || arg === "-d") {
      const parts = [];
      while (args[0] && !args[0].startsWith("-")) parts.push(args.shift());
      if (parts.length === 0) prompt = true;
      else deviceParts.push(...parts);
      continue;
    }
    if (arg.startsWith("-")) {
      throw new Error(`Unknown option ${arg}.\n\n${usage(platform)}`);
    }
    deviceParts.push(arg);
  }

  const device = deviceParts.join(" ") || undefined;
  if (prompt && device) {
    throw new Error(
      `Pass a device name, or --device with no name to choose from the list. Not both.\n\n${usage(platform)}`,
    );
  }
  return { device, prompt, help };
}

export function run(
  command,
  args,
  {
    cwd = repoRoot,
    env = process.env,
    label = command,
    allowFailure = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, env, stdio: "inherit" });
    child.on("error", (error) => {
      reject(new Error(`Could not run ${command}: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code === 0 || allowFailure) {
        resolve(code ?? 0);
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit ${code}`;
      reject(new Error(`${label} failed (${reason}).`));
    });
  });
}

export function capture(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    const out = [];
    const err = [];
    child.stdout.on("data", (chunk) => out.push(chunk));
    child.stderr.on("data", (chunk) => err.push(chunk));
    child.on("error", (error) => {
      reject(new Error(`Could not run ${command}: ${error.message}`));
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve(Buffer.concat(out).toString("utf8"));
        return;
      }
      const reason = signal ? `signal ${signal}` : `exit ${code}`;
      const details = Buffer.concat(err).toString("utf8").trim();
      reject(new Error(details || `${command} failed (${reason}).`));
    });
  });
}

function printDevices(devices) {
  for (const [index, device] of devices.entries()) {
    console.log(`  ${index + 1}. ${device.label}`);
  }
}

function matchDevice(devices, query, { allowIndex }) {
  if (allowIndex && /^\d+$/.test(query)) {
    const index = Number(query);
    if (index >= 1 && index <= devices.length) {
      return { ok: true, device: devices[index - 1] };
    }
    return { ok: false, message: `Pick a number from 1 to ${devices.length}.` };
  }

  const needle = query.toLowerCase();
  const exact = devices.filter(
    (device) =>
      device.id.toLowerCase() === needle ||
      device.name.toLowerCase() === needle ||
      device.label.toLowerCase() === needle,
  );
  if (exact.length === 1) return { ok: true, device: exact[0] };
  if (exact.length > 1) {
    return {
      ok: false,
      message: allowIndex
        ? `"${query}" matches more than one device. Enter the number or the full line.`
        : `"${query}" matches more than one device. Pass the full line:`,
      matches: exact,
    };
  }
  return {
    ok: false,
    message: `No device matches "${query}".`,
    matches: devices,
  };
}

function defaultDevice(devices) {
  return (
    devices.find((device) => !device.simulator) ??
    devices.find((device) => device.booted) ??
    null
  );
}

async function promptForDevice(devices) {
  if (!stdin.isTTY) {
    console.error("Pass a device name. --device needs a terminal to ask.");
    printDevices(devices);
    process.exit(1);
  }

  printDevices(devices);
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = (await prompt.question("Device number or name: ")).trim();
      if (!answer) {
        console.error(
          `Enter a number from 1 to ${devices.length}, or a device name.`,
        );
        continue;
      }
      const picked = matchDevice(devices, answer, { allowIndex: true });
      if (picked.ok) {
        console.log(`Using ${picked.device.label}.`);
        return picked.device;
      }
      console.error(picked.message);
      if (picked.matches) printDevices(picked.matches);
    }
  } finally {
    prompt.close();
  }
}

export async function selectDevice(devices, { query, prompt }) {
  if (devices.length === 0) {
    throw new Error("No devices to choose from.");
  }

  if (query) {
    const picked = matchDevice(devices, query, { allowIndex: false });
    if (!picked.ok) {
      console.error(picked.message);
      printDevices(picked.matches ?? devices);
      process.exit(1);
    }
    console.log(`Using ${picked.device.label}.`);
    return picked.device;
  }

  if (prompt) return promptForDevice(devices);

  const picked = defaultDevice(devices);
  if (!picked) {
    throw new Error(
      "No phone is connected and no simulator is running. Pass --device to pick one.",
    );
  }
  console.log(`Using ${picked.label}.`);
  return picked;
}

export function sortDevices(devices) {
  return [...devices].sort((a, b) => {
    if (a.simulator !== b.simulator) return a.simulator ? 1 : -1;
    return a.label.localeCompare(b.label);
  });
}

export function requireEnv() {
  const envFile = path.join(repoRoot, ".env");
  if (!existsSync(envFile)) {
    throw new Error(
      `Missing ${envFile}. Copy .env.example to .env and set FISHJAM_ID and FISHJAM_SDK_API_URL.`,
    );
  }
}

// Entry point for a platform's scripts/start.mjs.
// `start` receives { query, prompt } and does the platform work.
export async function startExample({ platform, start }) {
  try {
    const { device, prompt, help } = parseArgs(process.argv.slice(2), platform);
    if (help) {
      console.log(usage(platform));
      process.exit(0);
    }
    await start({ query: device, prompt });
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
