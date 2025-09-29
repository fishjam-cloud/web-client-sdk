import "./index.css";

import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App.tsx";
import { BlurProvider } from "./components/BlurToggle";
import { Toaster } from "./components/ui/toaster";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BlurProvider>
      <App />
      <Toaster />
    </BlurProvider>
  </React.StrictMode>,
);
