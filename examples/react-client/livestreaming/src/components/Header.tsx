import { ConnectForm } from "./ConnectForm";

export const Header = () => {
  return (
    <div className="mb-8 flex space-y-2 flex-col items-center">
      <h1 className="text-3xl font-bold text-gray-900">
        Fishjam Livestream Demo
      </h1>

      <p className="text-gray-600">
        Broadcast and view live streams with Fishjam
      </p>

      <ConnectForm />
    </div>
  );
};
