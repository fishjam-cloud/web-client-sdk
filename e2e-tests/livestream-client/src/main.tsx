import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import { FISHJAM_ID } from "../config";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider fishjamId={FISHJAM_ID}>
      <App />
    </FishjamProvider>
  </React.StrictMode>,
);
