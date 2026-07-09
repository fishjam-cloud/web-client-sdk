import { Database } from "@db/sqlite";
import { JWT } from "google-auth-library";

const db = new Database("voip.db");

type DevicePlatform = "ios" | "android";

const isDevicePlatform = (value: unknown): value is DevicePlatform =>
  value === "ios" || value === "android";

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT NOT NULL PRIMARY KEY,
    voip_token TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    updated_at INTEGER NOT NULL
  )
`);

type PushParams = {
  token: string;
  roomName: string;
  displayName: string;
  isVideo: boolean;
};

// --- FCM push (Android) ---

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

const serviceAccount: ServiceAccount = JSON.parse(
  await Deno.readTextFile("./fcm-credentials.json"),
);

const authClient = new JWT({
  email: serviceAccount.client_email,
  key: serviceAccount.private_key,
  scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
});

async function getAccessToken(): Promise<string> {
  const { token } = await authClient.getAccessToken();
  if (!token) throw new Error("Failed to get access token");
  return token;
}

async function sendFcmPush(params: PushParams): Promise<void> {
  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token: params.token,
          data: {
            roomName: params.roomName,
            displayName: params.displayName,
            isVideo: String(params.isVideo),
          },
          android: { priority: "high" },
        },
      }),
    },
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`FCM push failed ${res.status}: ${text}`);
  }
}

// --- APNs VoIP push (certificate-based) ---

const BUNDLE_ID = "io.fishjam.example.voipcall";
const APNS_HOST = "api.development.push.apple.com";

const apnsPem = await Deno.readTextFile("./apns.pem");
const apnsClient = Deno.createHttpClient({ cert: apnsPem, key: apnsPem });

async function sendApnsPush(params: PushParams): Promise<void> {
  const res = await fetch(`https://${APNS_HOST}/3/device/${params.token}`, {
    client: apnsClient,
    method: "POST",
    headers: {
      "apns-push-type": "voip",
      "apns-topic": `${BUNDLE_ID}.voip`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roomName: params.roomName,
      displayName: params.displayName,
      isVideo: params.isVideo,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`APNs push failed ${res.status}: ${text}`);
  }
}

// --- Push routing ---

const sendPush: Record<DevicePlatform, (params: PushParams) => Promise<void>> =
  {
    ios: sendApnsPush,
    android: sendFcmPush,
  };

// --- Helpers ---

const json = (data: unknown, status = 200) => Response.json(data, { status });

// --- Route handler ---

Deno.serve({ port: 4400 }, async (req) => {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);

  // POST /register  { username, voipToken, platform }
  if (req.method === "POST" && url.pathname === "/register") {
    const { username, voipToken, platform } = (await req.json()) as {
      username: string;
      voipToken: string;
      platform: string;
    };
    if (!username || !voipToken) {
      return json({ error: "username and voipToken are required" }, 400);
    }
    if (!isDevicePlatform(platform)) {
      return json({ error: 'platform must be "ios" or "android"' }, 400);
    }
    db.exec(
      `INSERT INTO users (username, voip_token, platform, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(username) DO UPDATE SET voip_token=excluded.voip_token, platform=excluded.platform, updated_at=excluded.updated_at`,
      [username, voipToken, platform, Date.now()],
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
    const { from, to, roomName, isVideo } = (await req.json()) as {
      from: string;
      to: string;
      roomName: string;
      isVideo: boolean;
    };
    if (!from || !to || !roomName)
      return json({ error: "from, to and roomName are required" }, 400);

    const calleeRows = db.sql<{ voip_token: string; platform: DevicePlatform }>`
      SELECT voip_token, platform FROM users WHERE username = ${to}
    `;
    if (calleeRows.length === 0)
      return json({ error: "callee not found" }, 404);
    const { voip_token: voipToken, platform } = calleeRows[0];

    try {
      await sendPush[platform]({
        token: voipToken,
        roomName: roomName,
        displayName: from,
        isVideo: isVideo,
      });
    } catch (err) {
      console.error(`Failed to send ${platform} VoIP push:`, err);
      return json({ error: "failed to send VoIP push" }, 502);
    }

    return json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
});
