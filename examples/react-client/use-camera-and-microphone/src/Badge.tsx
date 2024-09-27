import type { PeerStatus } from "@fishjam-cloud/react-client";

type Props = {
  status: PeerStatus;
};

const getBadgeColor = (status: PeerStatus) => {
  switch (status) {
    case "connected":
      return "badge-success";
    case "error":
      return "badge-error";
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
