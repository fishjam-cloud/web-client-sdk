import { act } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useStatistics } from "../hooks/useStatistics";
import { useUpdatePeerMetadata } from "../hooks/useUpdatePeerMetadata";
import { renderHookWithProvider } from "./support/renderWithProvider";

describe("useUpdatePeerMetadata", () => {
  it("forwards metadata to the client", () => {
    const { result, client } = renderHookWithProvider(() => useUpdatePeerMetadata());
    act(() => result.current.updatePeerMetadata({ role: "host" }));
    expect(client.updatePeerMetadata).toHaveBeenCalledWith({ role: "host" });
  });
});

describe("useStatistics", () => {
  it("delegates to client.getStatistics", async () => {
    const { result, client } = renderHookWithProvider(() => useStatistics());
    await act(async () => {
      await result.current.getStatistics();
    });
    expect(client.getStatistics).toHaveBeenCalledTimes(1);
  });
});
