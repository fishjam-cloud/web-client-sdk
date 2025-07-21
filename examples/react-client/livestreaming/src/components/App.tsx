import { FishjamCtxProvider } from "./FishjamContext";
import { Header } from "./Header";
import LivestreamStreamer from "./LivestreamStreamer";
import LivestreamViewer from "./LivestreamViewer";

export const App = () => {
  return (
    <FishjamCtxProvider>
      <div className="min-h-screen bg-gray-50 p-8">
        <Header />

        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <LivestreamStreamer />

            <LivestreamViewer />
          </div>
        </div>
      </div>
    </FishjamCtxProvider>
  );
};
