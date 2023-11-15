import { create } from "@jellyfish-dev/react-client-sdk";
import { PeerMetadata, TrackMetadata } from "./App";

// Create a Membrane client instance
// remember to use JellyfishContextProvider
export const { useApi, useTracks, useStatus, useConnect, useDisconnect, JellyfishContextProvider } = create<
  PeerMetadata,
  TrackMetadata
>();
