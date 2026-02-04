function getFishjamUrl() {
  try {
    return import.meta.env.VITE_FISHJAM_URL;
  } catch {
    return process.env.VITE_FISHJAM_URL;
  }
}

const fishjamUrl = getFishjamUrl();

if (!fishjamUrl) {
  throw new Error("VITE_FISHJAM_URL environment variable is not set");
}

export const FISHJAM_URL = fishjamUrl;

export const FISHJAM_WS_URL = `${FISHJAM_URL}/socket/peer/websocket`;
