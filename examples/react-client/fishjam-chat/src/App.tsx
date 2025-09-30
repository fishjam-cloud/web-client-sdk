import { FishjamProvider } from "@fishjam-cloud/react-client";
import { useState } from "react";

import { BlurProvider } from "./components/BlurToggle";
import Router from "./Router";

const defaultFishjamId =
  new URLSearchParams(window.location.search).get("fishjamId") ??
  import.meta.env.VITE_FISHJAM_ID;

function App() {
  const [fishjamId, setFishjamId] = useState<string>(defaultFishjamId);

  return (
    <FishjamProvider fishjamId={fishjamId}>
      <BlurProvider>
        <Router onFishjamIdChange={setFishjamId} />
      </BlurProvider>
    </FishjamProvider>
  );
}

export default App;
