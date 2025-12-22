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

export function extractDomainFromFishjamId(fishjamId: string): string {
  try {
    const url = new URL(fishjamId);
    return url.origin;
  } catch {
    return "https://fishjam.io";
  }
}

export function buildLivestreamWhipUrl(fishjamId: string): string {
  const domain = extractDomainFromFishjamId(fishjamId);
  return `${domain}/api/v1/live/api/whip`;
}

export function buildLivestreamWhepUrl(fishjamId: string): string {
  const domain = extractDomainFromFishjamId(fishjamId);
  return `${domain}/api/v1/live/api/whep`;
}
