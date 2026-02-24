import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const TO_PASS_TIMEOUT_MILLIS = 15 * 1000;

const expectWithLongerTimeout = expect.configure({
  timeout: TO_PASS_TIMEOUT_MILLIS,
});

type ViewerWindow = typeof window & {
  viewer?: {
    getStatistics: () => Promise<RTCStatsReport | undefined>;
  };
};

const getDecodedFrames = (page: Page): Promise<number> =>
  page.evaluate(async () => {
    const viewer = (window as ViewerWindow)?.viewer;
    if (!viewer) return -1;
    const stats = await viewer.getStatistics();
    if (!stats) return -1;
    for (const stat of stats.values()) {
      if (stat.type === "inbound-rtp") {
        return stat.framesDecoded ?? 0;
      }
    }
    return 0;
  });

export const startPublishing = async (page: Page) =>
  await test.step("Start publishing", async () => {
    await page
      .getByRole("button", { name: "Start Publishing", exact: true })
      .click();
    await expectWithLongerTimeout(
      page.locator("#publish-status"),
    ).toContainText("Publishing");
  });

export const stopPublishing = async (page: Page) =>
  await test.step("Stop publishing", async () => {
    await page
      .getByRole("button", { name: "Stop Publishing", exact: true })
      .click();
    await expectWithLongerTimeout(
      page.locator("#publish-status"),
    ).toContainText("Not publishing");
  });

export const startReceiving = async (page: Page) =>
  await test.step("Start receiving", async () => {
    await page
      .getByRole("button", { name: "Start Receiving", exact: true })
      .click();
    await expectWithLongerTimeout(
      page.locator("#receive-status"),
    ).toContainText("Receiving");
  });

export const stopReceiving = async (page: Page) =>
  await test.step("Stop receiving", async () => {
    await page
      .getByRole("button", { name: "Stop Receiving", exact: true })
      .click();
    await expectWithLongerTimeout(
      page.locator("#receive-status"),
    ).toContainText("Not receiving");
  });

export const assertThatVideoIsPlaying = async (page: Page) =>
  await test.step("Assert that video is playing", async () => {
    const firstMeasure = await getDecodedFrames(page);
    await expectWithLongerTimeout(async () =>
      expect(await getDecodedFrames(page)).toBeGreaterThan(firstMeasure),
    ).toPass();
  });

export const assertThatVideoStopped = async (page: Page) =>
  await test.step("Assert that video stopped", async () => {
    const firstMeasure = await getDecodedFrames(page);
    await page.waitForTimeout(500);
    const secondMeasure = await getDecodedFrames(page);
    expect(secondMeasure - firstMeasure).toBeLessThanOrEqual(0);
  });
