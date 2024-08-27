import { create } from "@fishjam-cloud/react-client";

// Create a Fishjam client instance
// remember to use FishjamContextProvider
export const {
  useClient,
  useTracks,
  useStatus,
  useConnect,
  useDisconnect,
  FishjamContextProvider,
} = create();
