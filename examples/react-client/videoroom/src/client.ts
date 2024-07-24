import { create } from "@fishjam-dev/react-client";

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
  FishjamContextProvider,
} = create<unknown, unknown>();
