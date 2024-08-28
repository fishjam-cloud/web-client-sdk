import { useMemo } from "react";
import { useFishjamContext } from "./fishjamContext";
import type { Selector } from "../state.types";

export function useSelector<Result>(selector: Selector<Result>): Result {
  const { state } = useFishjamContext();

  return useMemo(() => selector(state), [selector, state]);
}

export function useStatus() {
  return useSelector((s) => s.status);
}

export function useTracks() {
  return useSelector((s) => s.tracks);
}

export function useClient() {
  return useSelector((s) => s.client);
}
