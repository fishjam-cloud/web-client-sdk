import "./index.css";

import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import { BlurProvider } from "./components/BlurToggle";
import { Toaster } from "./components/ui/toaster";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider fishjamId={"67eaef1141154713b4b2b58d7d54c16e"}>
      <BlurProvider>
        <App />
        <Toaster />
      </BlurProvider>
    </FishjamProvider>
  </React.StrictMode>,
);
