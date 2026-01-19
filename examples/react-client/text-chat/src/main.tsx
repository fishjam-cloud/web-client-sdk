import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";

const fishjamId = import.meta.env.VITE_FISHJAM_ID ?? "http://localhost:5555";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <FishjamProvider fishjamId={fishjamId} debug>
    <App />
  </FishjamProvider>,
);
