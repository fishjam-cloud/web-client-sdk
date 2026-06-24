import { Database } from "@db/sqlite";

const db = new Database("voip.db");

// TODO: voip_token should be primary key but for testing it's easier if i do username :D
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT NOT NULL PRIMARY KEY,
    voip_token TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);

// --- APNs VoIP push ---

const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APNS_TEAM_ID = Deno.env.get("APNS_TEAM_ID") ?? "";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "";
const APNS_KEY_PATH = Deno.env.get("APNS_KEY_PATH") ?? "";
const APNS_ENV = Deno.env.get("APNS_ENV") ?? "development"; // 'production' | 'development'

let cachedApnsJwt: { token: string; issuedAt: number } | null = null;

async function loadP8Key(): Promise<CryptoKey> {
  const raw = await Deno.readTextFile(APNS_KEY_PATH);
  const pem = raw
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    der,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

async function getApnsJwt(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  // Reuse token for up to 55 minutes (APNs allows 60 min, drift buffer)
  if (cachedApnsJwt && now - cachedApnsJwt.issuedAt < 55 * 60) {
    return cachedApnsJwt.token;
  }

  const key = await loadP8Key();
  const header = base64UrlEncode(
    new TextEncoder().encode(
      JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID }),
    ),
  );
  const payload = base64UrlEncode(
    new TextEncoder().encode(JSON.stringify({ iss: APNS_TEAM_ID, iat: now })),
  );
  const sigInput = new TextEncoder().encode(`${header}.${payload}`);
  const sigDer = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    sigInput,
  );

  // DER → raw (r || s, 64 bytes) for APNs
  const der = new Uint8Array(sigDer);
  let offset = 2;
  const rLen = der[offset + 1];
  offset += 2;
  const r = der.slice(offset + (rLen > 32 ? 1 : 0), offset + rLen);
  offset += rLen;
  const sLen = der[offset + 1];
  offset += 2;
  const s = der.slice(offset + (sLen > 32 ? 1 : 0), offset + sLen);

  const rawSig = new Uint8Array(64);
  rawSig.set(r, 32 - r.length);
  rawSig.set(s, 64 - s.length);

  const token = `${header}.${payload}.${base64UrlEncode(rawSig)}`;
  cachedApnsJwt = { token, issuedAt: now };
  return token;
}

async function sendVoipPush(params: {
  voipToken: string;
  roomId: string;
  callerUsername: string;
  displayName: string;
}): Promise<void> {
  if (!APNS_KEY_PATH || !APNS_KEY_ID || !APNS_TEAM_ID || !APNS_BUNDLE_ID) {
    console.warn(
      "APNs not configured — skipping push (set APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, APNS_KEY_PATH)",
    );
    return;
  }

  const host =
    APNS_ENV === "production"
      ? "api.push.apple.com"
      : "api.development.push.apple.com";

  const jwt = await getApnsJwt();
  const url = `https://${host}/3/device/${params.voipToken}`;

  const body = JSON.stringify({
    aps: {},
    roomId: params.roomId,
    username: params.callerUsername,
    displayName: params.displayName,
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-push-type": "voip",
      "apns-topic": `${APNS_BUNDLE_ID}.voip`,
      "content-type": "application/json",
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`APNs push failed ${res.status}:`, text);
  }
}

// --- Helpers ---

const json = (data: unknown, status = 200) => Response.json(data, { status });

// --- Route handler ---

Deno.serve({ port: 4400 }, async (req) => {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);

  // POST /register  { username, voipToken }
  if (req.method === "POST" && url.pathname === "/register") {
    const { username, voipToken } = (await req.json()) as {
      username: string;
      voipToken: string;
    };
    if (!username || !voipToken) {
      return json({ error: "username and voipToken are required" }, 400);
    }
    db.exec(
      `INSERT INTO users (username, voip_token, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET voip_token=excluded.voip_token, updated_at=excluded.updated_at`,
      [username, voipToken, Date.now()],
    );
    return json({ ok: true });
  }

  // GET /users?exclude=<me>
  // TODO: we'll have to omit by token, not username !
  if (req.method === "GET" && url.pathname === "/users") {
    const exclude = url.searchParams.get("exclude") ?? "";
    const rows = db.sql<{ username: string }>`
      SELECT username FROM users WHERE username != ${exclude} ORDER BY username
    `;
    return json(rows.map((r) => r.username));
  }

  // POST /call  { from, to, roomName }
  if (req.method === "POST" && url.pathname === "/call") {
    const { from, to, roomName } = (await req.json()) as {
      from: string;
      to: string;
      roomName: string;
    };
    if (!from || !to || !roomName)
      return json({ error: "from, to and roomName are required" }, 400);

    const calleeRows = db.sql<{ voip_token: string }>`
      SELECT voip_token FROM users WHERE username = ${to}
    `;
    if (calleeRows.length === 0)
      return json({ error: "callee not found" }, 404);
    const voipToken = calleeRows[0].voip_token;

    await sendVoipPush({
      voipToken,
      roomId: roomName,
      callerUsername: from,
      displayName: from,
    });

    return json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
});
