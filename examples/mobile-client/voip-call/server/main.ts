import { Database } from '@db/sqlite';
import { JWT } from 'google-auth-library';

const db = new Database('voip.db');

type DevicePlatform = 'ios' | 'android';

const isDevicePlatform = (value: unknown): value is DevicePlatform =>
  value === 'ios' || value === 'android';

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    username TEXT NOT NULL PRIMARY KEY,
    voip_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL,
    avatar TEXT,
    updated_at INTEGER NOT NULL
  )
`);

// --- Avatars (served from ./avatars) ---

const AVATARS = ['orchid', 'mint', 'sunny', 'coral', 'ocean'] as const;
type AvatarName = (typeof AVATARS)[number];

const baseUrl = (req: Request) =>
  Deno.env.get('PUBLIC_BASE_URL') ?? new URL(req.url).origin;

const avatarUrl = (req: Request, avatar: string) =>
  `${baseUrl(req)}/avatars/${avatar}.png`;

/**
 * Picks the avatar currently assigned to the fewest users (round-robin balance),
 * breaking ties at random. Called once per user at registration.
 */
function assignLeastUsedAvatar(): AvatarName {
  const counts = new Map<AvatarName, number>(AVATARS.map((a) => [a, 0]));
  const rows = db.sql<{ avatar: string | null }>`
    SELECT avatar FROM users WHERE avatar IS NOT NULL
  `;
  for (const { avatar } of rows) {
    if (avatar && counts.has(avatar as AvatarName)) {
      counts.set(avatar as AvatarName, counts.get(avatar as AvatarName)! + 1);
    }
  }
  const min = Math.min(...counts.values());
  const leastUsed = AVATARS.filter((a) => counts.get(a) === min);
  return leastUsed[Math.floor(Math.random() * leastUsed.length)];
}

type PushParams = {
  token: string;
  roomName: string;
  displayName: string;
  isVideo: boolean;
  avatarUrl?: string;
};

async function readIfPresent(path: string): Promise<string | null> {
  try {
    return await Deno.readTextFile(path);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
}

// --- FCM push (Android) ---

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id: string;
};

const fcmCredentials = await readIfPresent('./fcm-credentials.json');
const serviceAccount: ServiceAccount | null = fcmCredentials
  ? JSON.parse(fcmCredentials)
  : null;

const authClient = serviceAccount
  ? new JWT({
    email: serviceAccount.client_email,
    key: serviceAccount.private_key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  })
  : null;

async function getAccessToken(client: JWT): Promise<string> {
  const { token } = await client.getAccessToken();
  if (!token) throw new Error('Failed to get access token');
  return token;
}

async function sendFcmPush(params: PushParams): Promise<void> {
  if (!serviceAccount || !authClient) {
    throw new Error('Android push requires ./fcm-credentials.json');
  }
  const accessToken = await getAccessToken(authClient);

  const res = await fetch(
    `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token: params.token,
          data: {
            roomName: params.roomName,
            displayName: params.displayName,
            isVideo: String(params.isVideo),
            ...(params.avatarUrl ? { avatarUrl: params.avatarUrl } : {}),
          },
          android: { priority: 'high' },
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

const BUNDLE_ID = 'io.fishjam.example.voipcall';
const APNS_HOST = 'api.development.push.apple.com';

const apnsPem = await readIfPresent('./apns.pem');
const apnsClient = apnsPem
  ? Deno.createHttpClient({ cert: apnsPem, key: apnsPem })
  : null;

async function sendApnsPush(params: PushParams): Promise<void> {
  if (!apnsClient) {
    throw new Error('iOS push requires ./apns.pem');
  }
  const res = await fetch(`https://${APNS_HOST}/3/device/${params.token}`, {
    client: apnsClient,
    method: 'POST',
    headers: {
      'apns-push-type': 'voip',
      'apns-topic': `${BUNDLE_ID}.voip`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      roomName: params.roomName,
      displayName: params.displayName,
      isVideo: params.isVideo,
      ...(params.avatarUrl ? { avatarUrl: params.avatarUrl } : {}),
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

// --- WebSocket signaling registry ---

const sockets = new Map<string, WebSocket>();

// --- Route handler ---

Deno.serve({ port: 4400 }, async (req) => {
  const url = new URL(req.url);
  console.log(`${req.method} ${url.pathname}`);

  // POST /register  { username, voipToken, platform }
  if (req.method === 'POST' && url.pathname === '/register') {
    const { username, voipToken, platform } = (await req.json()) as {
      username: string;
      voipToken: string;
      platform: string;
    };
    if (!username || !voipToken) {
      return json({ error: 'username and voipToken are required' }, 400);
    }
    if (!isDevicePlatform(platform)) {
      return json({ error: 'platform must be "ios" or "android"' }, 400);
    }
    const existing = db.sql<{ avatar: string | null }>`
      SELECT avatar FROM users WHERE username = ${username}
    `;
    const avatar = existing[0]?.avatar ?? assignLeastUsedAvatar();
    db.exec(
      `INSERT OR REPLACE INTO users (username, voip_token, platform, avatar, updated_at) VALUES (?, ?, ?, ?, ?)`,
      [username, voipToken, platform, avatar, Date.now()],
    );
    return json({ ok: true, avatarUrl: avatarUrl(req, avatar) });
  }

  // GET /users?exclude=<me>
  if (req.method === 'GET' && url.pathname === '/users') {
    const exclude = url.searchParams.get('exclude') ?? '';
    const rows = db.sql<{ username: string; avatar: string | null }>`
      SELECT username, avatar FROM users WHERE username != ${exclude} ORDER BY username
    `;
    return json(
      rows.map((r) => ({
        username: r.username,
        avatarUrl: r.avatar ? avatarUrl(req, r.avatar) : null,
      })),
    );
  }

  // POST /call  { from, to, roomName }
  if (req.method === 'POST' && url.pathname === '/call') {
    const { from, to, roomName, isVideo } = (await req.json()) as {
      from: string;
      to: string;
      roomName: string;
      isVideo: boolean;
    };
    if (!from || !to || !roomName) {
      return json({ error: 'from, to and roomName are required' }, 400);
    }

    const calleeRows = db.sql<{ voip_token: string; platform: string | null }>`
      SELECT voip_token, platform FROM users WHERE username = ${to}
    `;
    if (calleeRows.length === 0) {
      return json({ error: 'callee not found' }, 404);
    }
    const { voip_token: voipToken, platform } = calleeRows[0];
    if (!isDevicePlatform(platform)) {
      return json({ error: 'callee registered without a known platform' }, 409);
    }

    const callerRows = db.sql<{ avatar: string | null }>`
      SELECT avatar FROM users WHERE username = ${from}
    `;
    const callerAvatar = callerRows[0]?.avatar;

    try {
      await sendPush[platform]({
        token: voipToken,
        roomName: roomName,
        displayName: from,
        isVideo: isVideo,
        avatarUrl: callerAvatar ? avatarUrl(req, callerAvatar) : undefined,
      });
    } catch (err) {
      console.error(`Failed to send ${platform} VoIP push:`, err);
      return json({ error: 'failed to send VoIP push' }, 502);
    }

    return json({ ok: true });
  }

  // GET /ws?username=<name>  — bidirectional signaling socket
  if (req.method === 'GET' && url.pathname === '/ws') {
    const username = url.searchParams.get('username');
    if (!username) return json({ error: 'username required' }, 400);

    const { socket, response } = Deno.upgradeWebSocket(req);
    socket.onopen = () => {
      sockets.set(username, socket);
      console.log(`${username} connected`);
    };
    socket.onclose = () => {
      if (sockets.get(username) === socket) sockets.delete(username);
      console.log(`${username} disconnected`);
    };
    socket.onmessage = (e) => {
      let msg: { type?: string; to?: string; [key: string]: unknown };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      if (!msg.to) return;
      const target = sockets.get(msg.to);
      if (target?.readyState === WebSocket.OPEN) {
        target.send(JSON.stringify({ ...msg, from: username }));
      }
    };
    return response;
  }

  // GET /avatars/<name>.png  — serve the bundled avatar images
  if (req.method === 'GET' && url.pathname.startsWith('/avatars/')) {
    const name = url.pathname.slice('/avatars/'.length);
    if (!/^[a-z0-9_-]+\.png$/.test(name)) {
      return new Response('Not found', { status: 404 });
    }
    try {
      const file = await Deno.readFile(`./avatars/${name}`);
      return new Response(file, {
        headers: {
          'content-type': 'image/png',
          'cache-control': 'public, max-age=86400',
        },
      });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  }

  return new Response('Not found', { status: 404 });
});
