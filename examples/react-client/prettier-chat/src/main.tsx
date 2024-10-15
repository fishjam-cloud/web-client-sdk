import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { FishjamProvider } from "@fishjam-cloud/react-client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamProvider>
      <App />
    </FishjamProvider>
  </React.StrictMode>
);
