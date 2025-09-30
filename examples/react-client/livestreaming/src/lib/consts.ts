export const DEFAULT_FISHJAM_ID =
  new URLSearchParams(window.location.search).get("fishjamId") ??
  import.meta.env.VITE_FISHJAM_ID;
