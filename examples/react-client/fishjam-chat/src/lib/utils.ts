import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

import { type RoomForm } from "@/types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function nonNullablePredicate<T>(value: T): value is NonNullable<T> {
  return Boolean(value);
}

const ROOM_FORM_VALUES_KEY = "room-form-values";

export const getPersistedFormValues = (): Partial<RoomForm> => {
  const persistedValues = localStorage.getItem(ROOM_FORM_VALUES_KEY);
  if (!persistedValues) return {};

  try {
    return JSON.parse(persistedValues);
  } catch (_) {
    return {};
  }
};

export const persistFormValues = (values: RoomForm) => {
  localStorage.setItem(ROOM_FORM_VALUES_KEY, JSON.stringify(values));
};
