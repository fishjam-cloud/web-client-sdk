import { act } from "@testing-library/react";

import { useStatistics } from "../hooks/useStatistics";
import { useUpdatePeerMetadata } from "../hooks/useUpdatePeerMetadata";
import { describe, expect, it } from "./support/fixtures";

describe("useUpdatePeerMetadata", () => {
  it("forwards metadata to the client", ({ client, renderHook }) => {
    const { result } = renderHook(() => useUpdatePeerMetadata());
    act(() => result.current.updatePeerMetadata({ role: "host" }));
    expect(client.updatePeerMetadata).toHaveBeenCalledWith({ role: "host" });
  });
});

describe("useStatistics", () => {
  it("delegates to client.getStatistics", async ({ client, renderHook }) => {
    const { result } = renderHook(() => useStatistics());
    await act(async () => {
      await result.current.getStatistics();
    });
    expect(client.getStatistics).toHaveBeenCalledTimes(1);
  });
});
