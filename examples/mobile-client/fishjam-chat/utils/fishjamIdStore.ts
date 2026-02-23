let onFishjamIdChangeCallback: ((id: string) => void) | null = null;

export function setFishjamIdChangeCallback(callback: (id: string) => void) {
  onFishjamIdChangeCallback = callback;
}

export function changeFishjamId(id: string) {
  onFishjamIdChangeCallback?.(id);
}

