import { useState } from "react";

import Broadcaster from "./Broadcaster";
import LivestreamViewer from "./LivestreamViewer";

export const App = () => {
  const [viewerToken, setViewerToken] = useState<string>("");

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Fishjam Livestream Demo
          </h1>
          <p className="mt-2 text-gray-600">
            Broadcast and view live streams with Fishjam
          </p>
        </div>
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
  );
};
