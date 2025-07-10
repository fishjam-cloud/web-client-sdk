import "./index.css";

import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./components/App";
import { Toaster } from "./components/ui/toaster";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FishjamProvider fishjamId={import.meta.env.VITE_FISHJAM_ID}>
      <App />
      <Toaster />
    </FishjamProvider>
  </React.StrictMode>,
);
