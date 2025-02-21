import "./index.css";

import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import { BlurProvider } from "./components/BlurToggle.tsx";
import { Toaster } from "./components/ui/sonner.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider>
      <BlurProvider>
        <App />
        <Toaster />
      </BlurProvider>
    </FishjamProvider>
  </React.StrictMode>,
);
