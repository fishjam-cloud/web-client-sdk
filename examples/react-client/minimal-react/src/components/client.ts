import { create } from "@fishjam-cloud/react-client";
import type { PeerMetadata, TrackMetadata } from "./App";

// Create a Fishjam client instance
// remember to use FishjamContextProvider
export const { useClient, useTracks, useStatus, useConnect, useDisconnect, useSelector, FishjamContextProvider } =
  create<PeerMetadata, TrackMetadata>();
