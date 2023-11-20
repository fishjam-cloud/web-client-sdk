import { JellyfishClient } from "@jellyfish-dev/ts-client-sdk";
import { test, expect, type Page } from "@playwright/test";

test("displays basic UI", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/Jellyfish Minimal React/);
  await expect(page.getByPlaceholder("token")).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect", exact: true })).toBeVisible();
});

test("connects to Jellyfish server", async ({ page: firstPage, context }) => {
  const secondPage = await context.newPage();
  await firstPage.goto("/");
  await secondPage.goto("/");

  const roomRequest = await firstPage.request.post("http://localhost:5002/room");
  const roomId = (await roomRequest.json()).data.room.id as string;

  await joinRoomAndAddTrack(firstPage, roomId);
  await joinRoomAndAddTrack(secondPage, roomId);

  await expect(firstPage.locator("video")).toBeVisible();
  await expect(secondPage.locator("video")).toBeVisible();

  await Promise.all([assertThatOtherVideoIsPlaying(firstPage), assertThatOtherVideoIsPlaying(secondPage)]);
});

async function joinRoomAndAddTrack(page: Page, roomId: string): Promise<string> {
  const peerRequest = await page.request.post("http://localhost:5002/room/" + roomId + "/peer", {
    data: {
      type: "webrtc",
      options: {
        enableSimulcast: true,
      },
    },
  });
  const {
    peer: { id: peerId },
    token: peerToken,
  } = (await peerRequest.json()).data;

  await page.getByPlaceholder("token").fill(peerToken);
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await page.getByRole("button", { name: "Start screen share" }).click();

  return peerId;
}

async function assertThatOtherVideoIsPlaying(page: Page) {
  const playing = await page.evaluate(async () => {
    const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const getDecodedFrames = async () => {
      const stats = await peerConnection.getStats();
      for (const stat of stats.values()) {
        if (stat.type === "inbound-rtp") {
          return stat.framesDecoded;
        }
      }
    };

    const client = (window as unknown as { client: JellyfishClient<unknown, unknown> }).client;
    const peerConnection = (client as unknown as { webrtc: { connection: RTCPeerConnection } }).webrtc.connection;
    const firstMeasure = await getDecodedFrames();
    await sleep(400);
    const secondMeasure = await getDecodedFrames();
    return secondMeasure > firstMeasure;
  });
  expect(playing).toBe(true);
}
