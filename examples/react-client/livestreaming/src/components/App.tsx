import { useState } from "react";

import Broadcaster from "./Broadcaster";
import { FishjamCtxProvider } from "./FishjamContext";
import { Header } from "./Header";
import LivestreamViewer from "./LivestreamViewer";

export const App = () => {
  const [viewerToken, setViewerToken] = useState<string>("");

  return (
    <FishjamCtxProvider>
      <div className="min-h-screen bg-gray-50 p-8">
        <Header />

        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <Broadcaster
              onViewerTokenCreated={(token) => setViewerToken(token)}
            />

            <LivestreamViewer
              viewerToken={viewerToken}
              setViewerToken={setViewerToken}
            />
          </div>
        </div>
      </div>
    </FishjamCtxProvider>
  );
};
