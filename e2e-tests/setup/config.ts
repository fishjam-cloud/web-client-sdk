const WEBRTC_CLIENT_PORT = 5173;
const REACT_CLIENT_PORT = 3007;

export const FISHJAM_URL = process.env.FISHJAM_ID;
export const FISHJAM_AUTH_HEADER = `Bearer ${process.env.FISHJAM_TOKEN}`;
export const FISHJAM_WS_URL = `${FISHJAM_URL}/socket/peer/websocket`;

export const WEBRTC_CLIENT_URL = `http://localhost:${WEBRTC_CLIENT_PORT}`;
export const REACT_CLIENT_URL = `http://localhost:${REACT_CLIENT_PORT}`;

