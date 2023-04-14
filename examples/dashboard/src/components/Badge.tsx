import type { PeerStatus } from "@jellyfish-dev/react-client-sdk";

export const BadgeStatus = ({ status }: { status: PeerStatus }) => {
  const getBadeClass = () => {
    switch (status) {
      case "joined":
        return "badge-success";
      case "error":
        return "badge-error";
      case null:
        return "hidden";
      default:
        return "badge-info";
    }
  };

  return <span className={`badge ${getBadeClass()}`}>{status}</span>;
};
