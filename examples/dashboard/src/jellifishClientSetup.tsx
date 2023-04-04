import { createNoContextMembraneClient } from "@jellyfish-dev/jellyfish-react-client/externalState";

const TrackTypeValues = ["screensharing", "camera", "audio"] as const;
export type TrackType = (typeof TrackTypeValues)[number];

export type PeerMetadata = {
  name: string;
};
export type TrackMetadata = {
  type: TrackType;
  active: boolean;
};

export const { useConnect, useSelector } = createNoContextMembraneClient<PeerMetadata, TrackMetadata>();

// Remember to use MembraneContextProvider in main.tsx
// export const { MembraneContextProvider, useSelector, useConnect } = createMembraneClient<PeerMetadata, TrackMetadata>();
