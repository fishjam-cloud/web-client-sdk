import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./components/App";
import { FishjamContextProvider } from "./components/client";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <FishjamContextProvider>
      <App />
    </FishjamContextProvider>
  </React.StrictMode>,
);
