function getFishjamId() {
  try{
    return import.meta.env.VITE_FISHJAM_ID;
  }catch{
  return process.env.VITE_FISHJAM_ID;
  }
}

export const FISHJAM_URL = getFishjamId();

export const FISHJAM_WS_URL = `${FISHJAM_URL}/socket/peer/websocket`;


