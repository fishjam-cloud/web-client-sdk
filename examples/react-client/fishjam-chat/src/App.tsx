import { FishjamProvider } from "@fishjam-cloud/react-client";
import { useState } from "react";

import Router from "./Router";

function App() {
  const [fishjamId, setFishjamId] = useState<string>(
    import.meta.env.VITE_FISHJAM_ID,
  );

  return (
    <FishjamProvider fishjamId={fishjamId}>
      <Router onFishjamIdChange={setFishjamId} />
    </FishjamProvider>
  );
}

export default App;
