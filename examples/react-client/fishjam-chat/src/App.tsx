import { FishjamProvider } from "@fishjam-cloud/react-client";
import { useState } from "react";

import { BlurProvider } from "./components/BlurToggle";
import { DEFAULT_FISHJAM_ID } from "./lib/consts";
import Router from "./Router";

function App() {
  const [fishjamId, setFishjamId] = useState<string>(DEFAULT_FISHJAM_ID);

  return (
    <FishjamProvider fishjamId={fishjamId}>
      <BlurProvider>
        <Router onFishjamIdChange={setFishjamId} />
      </BlurProvider>
    </FishjamProvider>
  );
}

export default App;
