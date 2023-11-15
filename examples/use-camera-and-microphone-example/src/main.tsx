import React from "react";
import ReactDOM from "react-dom/client";
import MainControls from "./MainControls";
import "./index.css";
import { JellyfishContextProvider } from "./jellyfishSetup";
import AdditionalControls from "./AdditionalControls";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JellyfishContextProvider>
      <MainControls />
      <AdditionalControls />
    </JellyfishContextProvider>
  </React.StrictMode>,
);
