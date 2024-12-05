import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import type { RoomForm } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nonNullablePredicate<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

export function persistFormValues({
  roomManagerUrl,
  roomName,
  peerName,
}: RoomForm) {
  localStorage.setItem("roomManagerUrl", roomManagerUrl);
  localStorage.setItem("roomName", roomName);
  localStorage.setItem("peerName", peerName);
  sessionStorage.setItem("peerName", peerName);
}

export function getPersistedFormValues() {
  return {
    roomManagerUrl: localStorage.getItem("roomManagerUrl") ?? "",
    roomName: localStorage.getItem("roomName") ?? "",
    peerName:
      sessionStorage.getItem("peerName") ??
      localStorage.getItem("peerName") ??
      "",
  };
}
