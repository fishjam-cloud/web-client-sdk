import { create } from "@fishjam-dev/react-client";
import type { PeerMetadata, TrackMetadata } from "./App";

// Create a Membrane client instance
// remember to use FishjamContextProvider
export const { useClient, useTracks, useStatus, useConnect, useDisconnect, useSelector, FishjamContextProvider } =
  create<PeerMetadata, TrackMetadata>();
