import { PeerStatus } from "@jellyfish-dev/react-client-sdk";

type Props = {
  status: PeerStatus;
};

const getBadgeColor = (status: PeerStatus) => {
  switch (status) {
    case "joined":
      return "badge-success";
    case "error":
      return "badge-error";
    case "authenticated":
    case "connected":
      return "badge-info";
    case "connecting":
      return "badge-warning";
  }
};

export const Badge = ({ status }: Props) => (
  <div className="flex items-center gap-1">
    <span>Status:</span>
    <span className={`badge ${getBadgeColor(status)}`}>{status}</span>
  </div>
);
