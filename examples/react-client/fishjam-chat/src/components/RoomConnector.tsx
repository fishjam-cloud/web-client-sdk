import {
  useConnect,
  useDisconnect,
  useStatus,
} from "@fishjam-cloud/react-client";
import { Button } from "./Button";
import { useState } from "react";

type FormProps = {
  roomName: string;
  userName: string;
  roomManagerUrl: string;
};

function persistValues({ roomManagerUrl, roomName, userName }: FormProps) {
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
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const isUserConnected = status === "joined";

  const connectToRoom = async ({
    roomManagerUrl,
    roomName,
    userName,
  }: FormProps) => {
    const ensureUrlEndsWith = (url: string, ending: string) =>
      url.endsWith(ending) ? url : url + ending;

    let url = roomManagerUrl.trim();
    // in case user copied url from the main Fishjam Cloud panel
    url = url.replace("/*roomName*/users/*username*", "");
    url = ensureUrlEndsWith(url, "/");

    // in case user copied url from the Fishjam Cloud App view
    if (url.includes("/api/v1/connect/")) {
      url = ensureUrlEndsWith(url, "room-manager/");
    }

    // in case user started room manager locally
    // and provided only host (localhost:5004) or origin (http://localhost:5004)
    if (new URL(url).pathname === "/") {
      url = ensureUrlEndsWith(url, "api/rooms/");
    }

    const res = await fetch(`${url}${roomName}/users/${userName}`);

    if (!res.ok) {
      const msg = await res.text();
      console.error(msg);
      setConnectionError(msg);
      return;
    }
    setConnectionError(null);

    const { token, url: fishjamUrl } = (await res.json()) as {
      token: string;
      url: string;
    };

    connect({
      token,
      url: fishjamUrl,
      peerMetadata: { displayName: userName },
    });
  };

  const { defaultRoomManagerUrl, defaultUserName, defaultRoomName } =
    getPersistedValues();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const formProps = Object.fromEntries(formData) as FormProps;

    persistValues(formProps);

    await connectToRoom(formProps);
  };

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={handleSubmit}
      autoComplete="on"
    >
      <div className="flex flex-col justify-between">
        <label htmlFor="roomManagerUrl">Room Manager URL</label>
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

      <div className="flex flex-col justify-between">
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
      {connectionError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          {connectionError}
        </div>
      )}
    </form>
  );
}
