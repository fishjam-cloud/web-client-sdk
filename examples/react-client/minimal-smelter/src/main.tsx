import { FishjamProvider } from "@fishjam-cloud/react-client";
import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./components/App";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FishjamProvider>
      <App />
    </FishjamProvider>
  </React.StrictMode>,
);
