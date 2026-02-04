const fishjamUrl = process.env.VITE_FISHJAM_URL;

if (!fishjamUrl) {
  throw new Error("VITE_FISHJAM_URL environment variable is not set");
}

export const FISHJAM_URL = fishjamUrl;
