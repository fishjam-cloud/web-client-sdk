import React from "react";
import ReactDOM from "react-dom/client";
import MainControls from "./MainControls";
import "./index.css";
import { FishjamContextProvider } from "./fishjamSetup";
import AdditionalControls from "./AdditionalControls";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <FishjamContextProvider>
      <MainControls />
      <AdditionalControls />
    </FishjamContextProvider>
  </React.StrictMode>,
);
