import { renderHook } from "@testing-library/react";
import { FakeMediaStreamTrack } from "fake-mediastreamtrack";
import { describe, expect, it, vi } from "vitest";

import { useHandleTrackEnd } from "../hooks/internal/devices/useHandleStreamEnd";

describe("useHandleStreamEnd", () => {
  it("should return a default search term and original items", () => {
    const clearStream = vi.fn();
    const track = new FakeMediaStreamTrack({ kind: "it literally doesn't matter" });
    renderHook(() => useHandleTrackEnd({ track, clearStream }));

    expect(track.onended).toBeDefined();

    track.remoteStop();

    expect(clearStream).toHaveBeenCalled();
  });
});
