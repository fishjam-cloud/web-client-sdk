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
  useScreenShare,
  FishjamContextProvider,
} = create<unknown, unknown>();
