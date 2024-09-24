import {
  useConnect,
  useDisconnect,
  useStatus,
} from "@fishjam-cloud/react-client";
import { Button } from "./Button";
import { useState } from "react";

type FormProps = {
  roomName: string;
  participantName: string;
  roomManagerUrl: string;
};

function persistValues({
  roomManagerUrl,
  roomName,
  participantName,
}: FormProps) {
  localStorage.setItem("roomManagerUrl", roomManagerUrl);
  localStorage.setItem("roomName", roomName);
  localStorage.setItem("participantName", participantName);
}

function getPersistedValues() {
  return {
    defaultRoomManagerUrl: localStorage.getItem("roomManagerUrl") ?? "",
    defaultRoomName: localStorage.getItem("roomName") ?? "",
    defaultParticipantName: localStorage.getItem("participantName") ?? "",
  };
}

export function RoomConnector() {
  const connect = useConnect();
  const isUserConnected = useStatus() === "connected";
  const disconnect = useDisconnect();
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const connectToRoom = async ({
    roomManagerUrl,
    roomName,
    participantName,
  }: FormProps) => {
    const ensureUrlEndsWith = (url: string, ending: string) =>
      url.endsWith(ending) ? url : url + ending;

    let url = roomManagerUrl.trim();
    // in case user copied url from the main Fishjam Cloud panel
    url = url.replace("/*roomName*/users/*participantName*", "");
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

    const res = await fetch(`${url}${roomName}/users/${participantName}`);

    if (!res.ok) {
      const msg = await res.text();
      console.error(msg);
      setConnectionError(msg);
      return;
    }
    setConnectionError(null);

    const { participantToken, url: fishjamUrl } = (await res.json()) as {
      participantToken: string;
      url: string;
    };

    await connect({
      token: participantToken,
      url: fishjamUrl,
      peerMetadata: { displayName: participantName },
    });
  };

  const { defaultRoomManagerUrl, defaultParticipantName, defaultRoomName } =
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
        <label htmlFor="participantName">User name</label>
        <input
          id="participantName"
          name="participantName"
          type="text"
          disabled={isUserConnected}
          defaultValue={defaultParticipantName}
        />
      </div>

      <div className="flex justify-end gap-4">
        <Button onClick={disconnect} disabled={!isUserConnected}>
          Disconnect
        </Button>

        <Button type="submit" disabled={isUserConnected}>
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
