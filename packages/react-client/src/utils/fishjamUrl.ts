export function resolveFishjamUrl(fishjamId: string): string {
  try {
    return new URL(fishjamId).href;
  } catch {
    return `https://fishjam.io/api/v1/connect/${fishjamId}`;
  }
}

/**
 * Converts an HTTP(S) URL to WebSocket URL by replacing the protocol
 */
export function httpToWebSocketUrl(url: string): string {
  return url.replace(/^https?:\/\//, (match) => (match === "https://" ? "wss://" : "ws://"));
}

