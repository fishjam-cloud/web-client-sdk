import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "./css/daisyui.css";
// import { MembraneContextProvider } from "./jellifishClientSetup";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {/*<MembraneContextProvider>*/}
    <App />
    {/*</MembraneContextProvider>*/}
  </React.StrictMode>
);
