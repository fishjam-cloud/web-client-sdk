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

// --- APNs VoIP push (certificate-based) ---

const BUNDLE_ID = "io.fishjam.example.voipcall";
const APNS_HOST = "api.development.push.apple.com";

const apnsPem = await Deno.readTextFile("./apns.pem");
const apnsClient = Deno.createHttpClient({ cert: apnsPem, key: apnsPem });

async function sendVoipPush(params: {
  voipToken: string;
  roomName: string;
  displayName: string;
  isVideo: boolean;
}): Promise<void> {
  const res = await fetch(`https://${APNS_HOST}/3/device/${params.voipToken}`, {
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
    const { from, to, roomName, isVideo } = (await req.json()) as {
      from: string;
      to: string;
      roomName: string;
      isVideo: boolean;
    };
    if (!from || !to || !roomName)
      return json({ error: "from, to and roomName are required" }, 400);

    const calleeRows = db.sql<{ voip_token: string }>`
      SELECT voip_token FROM users WHERE username = ${to}
    `;
    if (calleeRows.length === 0)
      return json({ error: "callee not found" }, 404);
    const voipToken = calleeRows[0].voip_token;

    try {
      await sendVoipPush({
        voipToken,
        roomName: roomName,
        displayName: from,
        isVideo: isVideo,
      });
    } catch (err) {
      console.error("Failed to send VoIP push:", err);
      return json({ error: "failed to send VoIP push" }, 502);
    }

    return json({ ok: true });
  }

  return new Response("Not found", { status: 404 });
});
