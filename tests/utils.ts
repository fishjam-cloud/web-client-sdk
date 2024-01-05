import { expect, Page, test } from "@playwright/test";

export const joinRoomAndAddScreenShare = async (page: Page, roomId: string): Promise<string> =>
  test.step("Join room and add track", async () => {
    const peerRequest = await createPeer(page, roomId);
    try {
      const {
        peer: { id: peerId },
        token: peerToken,
      } = (await peerRequest.json()).data;

      await test.step("Join room", async () => {
        await page.getByPlaceholder("token").fill(peerToken);
        await page.getByRole("button", { name: "Connect", exact: true }).click();
        await expect(page.getByText("Status: joined")).toBeVisible();
      });

      await test.step("Add screenshare", async () => {
        await page.getByRole("button", { name: "Start screen share", exact: true }).click();
      });

      return peerId;
    } catch (e) {
      // todo fix
      throw { status: peerRequest.status(), response: await peerRequest.json() };
    }
  });

export const assertThatRemoteTracksAreVisible = async (page: Page, otherClientIds: string[]) => {
  await test.step("Assert that remote tracks are visible", () =>
    Promise.all(
      otherClientIds.map((peerId) => expect(page.locator(`css=video[data-peer-id="${peerId}"]`)).toBeVisible()),
    ));
};

export const assertThatOtherVideoIsPlaying = async (page: Page) => {
  await test.step("Assert that media is working", async () => {
    const getDecodedFrames: () => Promise<number> = () =>
      page.evaluate(async () => {
        const peerConnection = (
          window as typeof window & { client: { webrtc: { connection: RTCPeerConnection | undefined } } }
        ).client.webrtc.connection;
        const stats = await peerConnection?.getStats();
        for (const stat of stats?.values() ?? []) {
          if (stat.type === "inbound-rtp") {
            return stat.framesDecoded;
          }
        }
        return 0;
      });
    const firstMeasure = await getDecodedFrames();
    await expect(async () => expect((await getDecodedFrames()) > firstMeasure).toBe(true)).toPass();
  });
};

export const createRoom = async (page: Page, maxPeers?: number) =>
  await test.step("Create room", async () => {
    const data = {
      ...(maxPeers ? { maxPeers } : {}),
    };

    const roomRequest = await page.request.post("http://localhost:5002/room", { data });
    return (await roomRequest.json()).data.room.id as string;
  });

export const createPeer = async (page: Page, roomId: string, enableSimulcast: boolean = true) =>
  await test.step("Create room", async () => {
    return await page.request.post("http://localhost:5002/room/" + roomId + "/peer", {
      data: {
        type: "webrtc",
        options: {
          enableSimulcast,
        },
      },
    });
  });
