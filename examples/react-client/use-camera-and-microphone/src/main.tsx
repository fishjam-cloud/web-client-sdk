import "./index.css";

import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import AdditionalControls from "./AdditionalControls";
import MainControls from "./MainControls";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider>
      <MainControls />
      <AdditionalControls />
    </FishjamProvider>
  </React.StrictMode>,
);
