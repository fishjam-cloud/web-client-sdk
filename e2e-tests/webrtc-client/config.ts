function getFishjamUrl() {
  try {
    return import.meta.env.VITE_FISHJAM_URL;
  } catch {
    return process.env.VITE_FISHJAM_URL;
  }
}

function getSandboxApiUrl() {
  try {
    return import.meta.env.VITE_SANDBOX_API_URL;
  } catch {
    return process.env.VITE_SANDBOX_API_URL;
  }
}

const fishjamUrl = getFishjamUrl();
const sandboxApiUrl = getSandboxApiUrl();

if (!fishjamUrl) {
  throw new Error("VITE_FISHJAM_URL environment variable is not set");
}

if (!sandboxApiUrl) {
  throw new Error("VITE_SANDBOX_API_URL environment variable is not set");
}

export const FISHJAM_URL = fishjamUrl;
export const SANDBOX_API_URL = sandboxApiUrl;
export const FISHJAM_WS_URL = `${FISHJAM_URL}/socket/peer/websocket`;
