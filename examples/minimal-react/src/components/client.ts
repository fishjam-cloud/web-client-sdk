import { create } from "@jellyfish-dev/react-client-sdk";
import { PeerMetadata, TrackMetadata } from "./App";

// Create a Membrane client instance
// remember to use JellyfishContextProvider
export const { useClient, useTracks, useStatus, useConnect, useDisconnect, useSelector, JellyfishContextProvider } =
  create<PeerMetadata, TrackMetadata>();
