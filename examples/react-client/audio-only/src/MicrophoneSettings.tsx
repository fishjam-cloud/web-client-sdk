import { useMicrophone } from "@fishjam-cloud/react-client";

export const MicrophoneSettings = () => {
  const {
    isMicrophoneMuted,
    toggleMicrophoneMute,
    microphoneDevices,
    selectMicrophone,
  } = useMicrophone();

  return (
    <div>
      <select
        onChange={(e) => {
          selectMicrophone(e.target.value);
        }}
      >
        {microphoneDevices.map((device) => (
          <option value={device.deviceId}>{device.label}</option>
        ))}
      </select>

      <button onClick={toggleMicrophoneMute}>
        {isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"}
      </button>
    </div>
  );
};
