import React from "react";
import ReactDOM from "react-dom/client";
import MainControls from "./MainControls";
import "./index.css";
import AdditionalControls from "./AdditionalControls";
import { FishjamProvider } from "@fishjam-cloud/react-client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider>
      <MainControls />
      <AdditionalControls />
    </FishjamProvider>
  </React.StrictMode>,
);
