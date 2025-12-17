import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

export const joinRoomAndAddScreenShare = async (
  page: Page,
  roomId: string,
): Promise<string> =>
  test.step("Join room and add track", async () => {
    const peerRequest = await createPeer(page, roomId);
    try {
      const {
        peer: { id: peerId },
        token: peerToken,
      } = (await peerRequest.json()).data;

      await test.step("Join room", async () => {
        await page.getByPlaceholder("token").fill(peerToken);
        await page
          .getByRole("button", { name: "Connect", exact: true })
          .click();
        await expect(page.getByText("Status: connected")).toBeVisible();
      });

      await test.step("Add screenshare", async () => {
        await page
          .getByRole("button", { name: "Start screen share", exact: true })
          .click();
      });

      return peerId;
    } catch {
      // todo fix
      throw {
        status: peerRequest.status(),
        response: await peerRequest.json(),
      };
    }
  });

export const assertThatRemoteTracksAreVisible = async (
  page: Page,
  otherClientIds: string[],
) => {
  await test.step("Assert that remote tracks are visible", () =>
    Promise.all(
      otherClientIds.map((peerId) =>
        expect(
          page.locator(`css=video[data-peer-id="${peerId}"]`),
        ).toBeVisible(),
      ),
    ));
};

export const assertThatOtherVideoIsPlaying = async (page: Page) => {
  await test.step("Assert that media is working", async () => {
    const getDecodedFrames: () => Promise<number> = () =>
      page.evaluate(async () => {
        const getStatistics = (
          window as typeof window & { getStatistics: () => Promise<RTCStatsReport> }
        ).getStatistics;

        const stats = await getStatistics();
        for (const stat of stats?.values() ?? []) {
          if (stat.type === "inbound-rtp") {
            return stat.framesDecoded;
          }
        }
        return 0;
      });
    const firstMeasure = await getDecodedFrames();
    await expect(async () =>
      expect((await getDecodedFrames()) > firstMeasure).toBe(true),
    ).toPass();
  });
};

export const createRoom = async (page: Page, maxPeers?: number) =>
  await test.step("Create room", async () => {
    const data = {
      videoCodec: "vp8",
      ...(maxPeers ? { maxPeers } : {}),
    };

    const roomRequest = await page.request.post("http://localhost:5555/room", {
      data,
      headers: {
        "x-fishjam-cluster-uuid": "E",
      },
    });
    const response = await roomRequest.json();
    console.log(response);
    return response.data.room.id as string;
  });

export const createPeer = async (
  page: Page,
  roomId: string,
  enableSimulcast: boolean = true,
) =>
  await test.step("Create room", async () => {
    const roomRequest = await page.request.post(
      "http://localhost:5555/room/" + roomId + "/peer",
      {
        data: {
          type: "webrtc",
          options: {
            enableSimulcast,
          },
        },
        headers: {
          "x-fishjam-cluster-uuid": "E",
        },
      },
    );
    console.log(await roomRequest.json());
    return roomRequest;
  });
