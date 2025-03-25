import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { FishjamProvider } from "@fishjam-cloud/react-client";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <FishjamProvider>
      <App />
    </FishjamProvider>
  </StrictMode>,
);
