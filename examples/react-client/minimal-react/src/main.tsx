import { FishjamProvider } from "@fishjam-cloud/react-client";
import { FishjamClient } from "@fishjam-cloud/ts-client";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./components/App";

const fishjamId = import.meta.env.VITE_FISHJAM_ID ?? "http://localhost:5555";

const client = new FishjamClient({ reconnect: { maxAttempts: 100, initialDelay: 5000, delay: 0 }, debug: true });
(window as unknown as Record<string, unknown>).__fishjamClient = client;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FishjamProvider fishjamId={fishjamId} debug fishjamClient={client}>
      <App />
    </FishjamProvider>
  </React.StrictMode>,
);
