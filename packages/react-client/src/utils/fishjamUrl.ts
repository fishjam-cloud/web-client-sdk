export function resolveFishjamUrl(fishjamId: string): string {
  try {
    return new URL(fishjamId).href;
  } catch {
    return `https://fishjam.io/api/v1/connect/${fishjamId}`;
  }
}

export function httpToWebsocketUrl(url: string): string {
  return url.replace("https://", "wss://").replace("http://", "ws://");
}
