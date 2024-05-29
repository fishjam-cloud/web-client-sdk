import { test, expect, Locator } from '@playwright/test';
import { createRoom, joinRoom } from './utils';

test('Endpoint metadata gets correctly parsed', async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  const firstClientId = await joinRoom(firstPage, roomId, {
    goodStuff: 'ye',
    extraFluff: 'nah',
  });
  await joinRoom(secondPage, roomId, { goodStuff: 'ye' });

  await hasEqualObject(secondPage.locator(`#metadata-${firstClientId}`), {
    goodStuff: 'ye',
  });
  await hasEqualObject(secondPage.locator(`#raw-metadata-${firstClientId}`), {
    goodStuff: 'ye',
  });
  await expect(
    secondPage.locator(`#metadata-parsing-error-${firstClientId}`),
  ).toBeEmpty();
});

test("Invalid metadata doesn't get pushed to the server on connect", async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  await joinRoom(firstPage, roomId, { goodStuff: 'ye' });
  await joinRoom(secondPage, roomId, { notSoGoodStuff: ';/' }, false);

  await expect(secondPage.locator('#connection-status')).toHaveText('false');
  await firstPage.waitForTimeout(500);
  await expect(firstPage.locator('#endpoints-container > details')).toHaveCount(
    0,
  );
});

test("Invalid metadata doesn't get pushed to the server on update", async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  await joinRoom(firstPage, roomId, { goodStuff: 'ye' });
  const secondClientId = await joinRoom(secondPage, roomId, {
    goodStuff: 'ye',
  });

  await expect(firstPage.locator('#endpoints-container > details')).toHaveCount(
    1,
  );
  await secondPage
    .getByPlaceholder('endpoint metadata')
    .fill(JSON.stringify({ notSoGoodStuff: ';/' }));
  await secondPage.getByText('Update metadata', { exact: true }).click();
  await firstPage.waitForTimeout(500);
  await hasEqualObject(firstPage.locator(`#metadata-${secondClientId}`), {
    goodStuff: 'ye',
  });
  await hasEqualObject(firstPage.locator(`#raw-metadata-${secondClientId}`), {
    goodStuff: 'ye',
  });
  await expect(
    firstPage.locator(`#metadata-parsing-error-${secondClientId}`),
  ).toBeEmpty();
});

test('Track metadata gets correctly parsed', async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  await joinRoom(firstPage, roomId, { goodStuff: 'ye' });
  await joinRoom(secondPage, roomId, { goodStuff: 'ye' });
  await secondPage
    .getByPlaceholder('track metadata')
    .fill(JSON.stringify({ goodTrack: 'ye' }));
  await secondPage.getByText('Add a heart').click();
  await hasEqualObject(firstPage.locator(`[data-endpoint-id] > .metadata`), {
    goodTrack: 'ye',
  });
  await hasEqualObject(
    firstPage.locator(`[data-endpoint-id] > .raw-metadata`),
    { goodTrack: 'ye' },
  );
  await expect(
    firstPage.locator(`[data-endpoint-id] > .metadata-parsing-error`),
  ).toBeEmpty();
});

test("Invalid track metadata doesn't get pushed to the server when adding track", async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  await joinRoom(firstPage, roomId, { goodStuff: 'ye' });
  await joinRoom(secondPage, roomId, { goodStuff: 'ye' });
  await secondPage
    .getByPlaceholder('track metadata')
    .fill(JSON.stringify({ notSoGoodStuff: ';/' }));
  await secondPage.getByText('Add a heart').click();
  await firstPage.waitForTimeout(500);
  await expect(firstPage.locator('[data-endpoint-id]')).not.toBeVisible();
});

test("Invalid track metadata doesn't get pushed to the server when updating track metadata", async ({
  page: firstPage,
  context,
}) => {
  const secondPage = await context.newPage();
  await firstPage.goto('/');
  await secondPage.goto('/');

  const roomId = await createRoom(firstPage);

  await joinRoom(firstPage, roomId, { goodStuff: 'ye' });
  await joinRoom(secondPage, roomId, { goodStuff: 'ye' });
  await secondPage.getByText('Add a heart').click();
  await expect(firstPage.locator('[data-endpoint-id]')).toBeVisible();
  await secondPage
    .getByPlaceholder('track metadata')
    .fill(JSON.stringify({ notSoGoodStuff: ';/' }));
  await secondPage.getByText('Update metadata on heart track').click();
  await firstPage.waitForTimeout(500);
  await hasEqualObject(firstPage.locator(`[data-endpoint-id] > .metadata`), {
    goodTrack: 'ye',
  });
  await hasEqualObject(
    firstPage.locator(`[data-endpoint-id] > .raw-metadata`),
    { goodTrack: 'ye' },
  );
  await expect(
    firstPage.locator(`[data-endpoint-id] > .metadata-parsing-error`),
  ).toBeEmpty();
});

async function hasEqualObject(locator: Locator, expected: any) {
  await expect(async () => {
    const text = await locator.textContent();
    expect(text && JSON.parse(text)).toStrictEqual(expected);
  }).toPass();
}
