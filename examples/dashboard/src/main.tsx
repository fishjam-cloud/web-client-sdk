import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "./css/daisyui.css";
import { ServerSDKProvider } from "./components/ServerSdkContext";
import { Toaster } from "react-hot-toast";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ServerSDKProvider>
      <Toaster />
      <App />
    </ServerSDKProvider>
  </React.StrictMode>
);
