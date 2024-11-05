import { useScreenShare } from "@fishjam-cloud/react-client";

export const ScreenShareControls = () => {
  const screenShare = useScreenShare();

  const isScreensharing = !!screenShare.stream;

  return (
    <div className="flex flex-col gap-2">
      <button
        className="btn btn-success btn-sm"
        disabled={isScreensharing}
        onClick={async () => {
          try {
            await screenShare.startStreaming();
          } catch (error) {
            if (error instanceof Error && error.name === "NotAllowedError")
              return;
            console.error(error);
          }
        }}
      >
        Share the screen
      </button>

      <button
        className="btn btn-error btn-sm"
        disabled={!isScreensharing}
        onClick={() => {
          screenShare.stopStreaming();
        }}
      >
        Stop screensharing
      </button>
    </div>
  );
};
