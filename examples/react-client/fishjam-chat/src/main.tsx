import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { FishjamProvider } from "@fishjam-cloud/react-client";
import { BlurProvider } from "./components/BlurToggle.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider autoStreamCamera={false} autoStreamMicrophone={false}>
      <BlurProvider>
        <App />
      </BlurProvider>
    </FishjamProvider>
  </React.StrictMode>,
);
