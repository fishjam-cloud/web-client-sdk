import { createFakeTrack } from "@fishjam-cloud/tsunami/testing";
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useHandleTrackEnd } from "../hooks/internal/devices/useHandleTrackEnd";

describe("useHandleTrackEnd", () => {
  it("should clear stream on track ended event", () => {
    const clearStream = vi.fn();
    const track = createFakeTrack({ kind: "audio" });

    renderHook(() => useHandleTrackEnd(track, clearStream));

    expect(track.onended).toBeDefined();

    track.remoteStop();

    expect(clearStream).toHaveBeenCalled();
  });
});
