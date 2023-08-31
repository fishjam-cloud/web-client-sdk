import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { JellyfishContextProvider } from "./jellyfishSetup";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <JellyfishContextProvider>
      <App />
    </JellyfishContextProvider>
  </React.StrictMode>
);
