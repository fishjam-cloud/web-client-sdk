import { Button } from "./Button";
import { useConnect, useStatus, useDisconnect } from "./client";

export function RoomConnector() {
  const connect = useConnect();
  const status = useStatus();
  const disconnect = useDisconnect();

  const isUserConnected = status === "joined";

  const connectToRoom = async ({
    roomName,
    username,
    fishjamUrl,
  }: Record<string, unknown>) => {
    const res = await fetch(`${fishjamUrl}/room-manager/${roomName}/users/${username}`);

    const { token, url } = (await res.json()) as { token: string, url: string };

    connect({
      peerMetadata: {},
      token,
      url,
    });
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formProps = Object.fromEntries(formData);

    await connectToRoom(formProps);
  };

  return (
    <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
      <div className="flex flex-col  justify-between">
        <label htmlFor="fishjamUrl">Fishjam url</label>
        <input
          id="fishjamUrl"
          name="fishjamUrl"
          type="text"
          disabled={isUserConnected}
        />
      </div>

      <div className="flex flex-col justify-between">
        <label htmlFor="roomName">Room name</label>
        <input
          id="roomName"
          name="roomName"
          type="text"
          disabled={isUserConnected}
        />
      </div>

      <div className="flex flex-col  justify-between">
        <label htmlFor="username">Username</label>
        <input
          id="username"
          name="username"
          type="text"
          disabled={isUserConnected}
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button onClick={disconnect} disabled={!status || !isUserConnected}>
          Disconnect
        </Button>

        <Button type="submit" disabled={!!status || isUserConnected}>
          Connect
        </Button>
      </div>
    </form>
  );
}
