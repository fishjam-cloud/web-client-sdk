import { create } from "@fishjam-cloud/react-client";

export const {
  useClient,
  useTracks,
  useStatus,
  useConnect,
  useDisconnect,
  useSelector,
  useSetupMedia,
  useCamera,
  useMicrophone,
  useParticipants,
  FishjamContextProvider,
} = create<unknown, unknown>();
