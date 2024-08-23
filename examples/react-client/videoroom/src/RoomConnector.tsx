import { Button } from "./Button";
import { useConnect, useStatus, useDisconnect } from "./client";

type FormProps = {
  roomName: string;
  userName: string;
  roomManagerUrl: string;
};

function psersistValues({ roomManagerUrl, roomName, userName }: FormProps) {
  localStorage.setItem("roomManagerUrl", roomManagerUrl);
  localStorage.setItem("roomName", roomName);
  localStorage.setItem("userName", userName);
}

function getPersistedValues() {
  return {
    defaultRoomManagerUrl: localStorage.getItem("roomManagerUrl") ?? "",
    defaultRoomName: localStorage.getItem("roomName") ?? "",
    defaultUserName: localStorage.getItem("userName") ?? "",
  };
}

export function RoomConnector() {
  const connect = useConnect();
  const status = useStatus();
  const disconnect = useDisconnect();

  const isUserConnected = status === "joined";

  const connectToRoom = async ({
    roomManagerUrl,
    roomName,
    userName,
  }: FormProps) => {
    // in case user copied url from admin panel
    const urlWithoutParams = roomManagerUrl.replace(
      "/*roomName*/users/*username*",
      "",
    );

    // trim slash from end
    const url = urlWithoutParams.endsWith("/")
      ? urlWithoutParams
      : urlWithoutParams + "/";
    const res = await fetch(`${url}${roomName}/users/${userName}`);

    const { token, url: fishjamUrl } = (await res.json()) as {
      token: string;
      url: string;
    };

    connect({
      peerMetadata: { name: userName },
      token,
      url: fishjamUrl,
    });
  };

  const { defaultRoomManagerUrl, defaultUserName, defaultRoomName } =
    getPersistedValues();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formProps = Object.fromEntries(formData) as FormProps;

    psersistValues(formProps);

    await connectToRoom(formProps);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
      autoComplete="on"
    >
      <div className="flex flex-col  justify-between">
        <label htmlFor="roomManagerUrl">Room URL</label>
        <input
          id="roomManagerUrl"
          name="roomManagerUrl"
          type="text"
          disabled={isUserConnected}
          defaultValue={defaultRoomManagerUrl}
        />
      </div>

      <div className="flex flex-col justify-between">
        <label htmlFor="roomName">Room name</label>
        <input
          id="roomName"
          name="roomName"
          type="text"
          disabled={isUserConnected}
          defaultValue={defaultRoomName}
        />
      </div>

      <div className="flex flex-col  justify-between">
        <label htmlFor="userName">User name</label>
        <input
          id="userName"
          name="userName"
          type="text"
          disabled={isUserConnected}
          defaultValue={defaultUserName}
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
