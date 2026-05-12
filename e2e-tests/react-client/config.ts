const fishjamUrl = process.env.VITE_FISHJAM_URL;
const sandboxApiUrl = process.env.VITE_SANDBOX_API_URL;

if (!fishjamUrl) {
  throw new Error("VITE_FISHJAM_URL environment variable is not set");
}

if (!sandboxApiUrl) {
  throw new Error("VITE_SANDBOX_API_URL environment variable is not set");
}

export const FISHJAM_URL = fishjamUrl;
export const SANDBOX_API_URL = sandboxApiUrl;