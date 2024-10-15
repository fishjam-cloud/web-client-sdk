import { JoinRoomCard } from "./components/JoinRoomCard";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import { RoomView } from "./components/RoomView";

const router = createBrowserRouter([
  {
    path: "/",
    element: <JoinRoomCard className="m-auto w-full max-w-md" />,
  },
  {
    path: "/room/",
    element: <RoomView />,
  },
]);

function App() {
  return (
    <main className="flex h-screen w-screen bg-stone-100">
      <RouterProvider router={router} />
    </main>
  );
}

export default App;
