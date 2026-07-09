import { renderHook, type RenderHookOptions, type RenderHookResult } from "@testing-library/react";
import { createElement, type PropsWithChildren } from "react";

import { FishjamProvider, type FishjamProviderProps } from "../../FishjamProvider";
import type { FakeFishjamClient } from "./fakeFishjamClient";

export type RenderHookWithProviderOptions<Props> = RenderHookOptions<Props> & {
  providerProps?: Partial<FishjamProviderProps>;
};

/**
 * Render a hook inside a real `FishjamProvider` wired to a `FakeFishjamClient`.
 *
 * Tests assert on the hook's public return shape and on the spy calls recorded
 * by the fake client. Both are part of the contract that must survive the move
 * of logic into ts-client/core — so these specs are the regression harness for
 * the rewrite, not throwaway scaffolding.
 */
export function renderHookWithProvider<Result, Props>(
  hook: (props: Props) => Result,
  client: FakeFishjamClient,
  options?: RenderHookWithProviderOptions<Props>,
): RenderHookResult<Result, Props> {
  const { providerProps, ...renderOptions } = options ?? {};

  const wrapper = ({ children }: PropsWithChildren) =>
    createElement(
      FishjamProvider,
      {
        fishjamId: "test-fishjam-id",
        fishjamClient: client.asClient(),
        // Off by default so device-persistence localStorage isn't exercised
        // unless a test opts in.
        persistLastDevice: false,
        ...providerProps,
      },
      children,
    );

  return renderHook(hook, { ...renderOptions, wrapper });
}
