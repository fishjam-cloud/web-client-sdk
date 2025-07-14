import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { FishjamProvider } from "@fishjam-cloud/react-client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FishjamProvider fishjamId={import.meta.env.VITE_FISHJAM_ID}>
      <App />
    </FishjamProvider>
  </StrictMode>,
);
