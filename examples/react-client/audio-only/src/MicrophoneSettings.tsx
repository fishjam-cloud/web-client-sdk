import { useMicrophone } from "@fishjam-cloud/react-client";

export const MicrophoneSettings = () => {
  const {
    isMicrophoneMuted,
    toggleMicrophoneMute,
    microphoneDevices,
    selectMicrophone,
  } = useMicrophone();

  return (
    <div style={{ margin: "20px 0", display: "flex", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        <label>Select microphone</label>

        <select
          onChange={(e) => {
            selectMicrophone(e.target.value);
          }}
        >
          {microphoneDevices.map((device) => (
            <option value={device.deviceId}>{device.label}</option>
          ))}
        </select>
      </div>

      <button onClick={toggleMicrophoneMute}>
        {isMicrophoneMuted ? "Unmute microphone" : "Mute microphone"}
      </button>
    </div>
  );
};
