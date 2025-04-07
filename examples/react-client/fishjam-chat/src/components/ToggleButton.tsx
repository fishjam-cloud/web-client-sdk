import type { LucideIcon } from "lucide-react";
import type { FC } from "react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./ui/button";

type Props = {
  isOn: boolean;
  Icon: LucideIcon;
  subject: string;
} & ButtonProps &
  React.RefAttributes<HTMLButtonElement>;

export const ToggleButton: FC<Props> = ({ isOn, Icon, subject, ...props }) => {
  return (
    <Button
      {...props}
      type="button"
      variant={isOn ? "default" : "outline"}
      className={cn("space-x-2", props.className)}
    >
      <Icon size={20} />

      <span>
        {isOn ? "Disable" : "Enable"} {subject}
      </span>
    </Button>
  );
};
