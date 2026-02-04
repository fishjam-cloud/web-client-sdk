function getFishjamId() {
  try{
    return import.meta.env.VITE_FISHJAM_URL;
  }catch{
  return process.env.VITE_FISHJAM_URL;
  }
}

export const FISHJAM_URL = getFishjamId();

export const FISHJAM_WS_URL = `${FISHJAM_URL}/socket/peer/websocket`;


