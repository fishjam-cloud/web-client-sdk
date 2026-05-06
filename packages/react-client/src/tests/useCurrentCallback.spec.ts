import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useCurrentCallback } from "../hooks/internal/useCurrentCallback";

describe("useCurrentCallback", () => {
  it("returns a stable function reference across re-renders", () => {
    const { result, rerender } = renderHook((handler: () => void) => useCurrentCallback(handler), {
      initialProps: () => undefined,
    });

    const firstRef = result.current;
    rerender(() => undefined);
    rerender(() => undefined);

    expect(result.current).toBe(firstRef);
  });

  it("invokes the latest handler when called after a re-render", () => {
    const first = vi.fn();
    const second = vi.fn();

    const { result, rerender } = renderHook((handler: () => void) => useCurrentCallback(handler), {
      initialProps: first,
    });

    result.current();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();

    rerender(second);

    result.current();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
  });

  it("forwards arguments and returns the handler's value", () => {
    const handler = vi.fn((a: number, b: number) => a + b);

    const { result } = renderHook(() => useCurrentCallback(handler));

    const sum = result.current(2, 3);

    expect(handler).toHaveBeenCalledWith(2, 3);
    expect(sum).toBe(5);
  });

  it("the wrapper captured before a re-render still calls the latest handler", () => {
    const first = vi.fn(() => "first");
    const second = vi.fn(() => "second");

    const { result, rerender } = renderHook((handler: () => string) => useCurrentCallback(handler), {
      initialProps: first,
    });

    // Simulates a consumer capturing the reference (e.g. inside a useEffect
    // closure) before the handler closure has changed.
    const captured = result.current;

    rerender(second);

    expect(captured()).toBe("second");
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });
});
