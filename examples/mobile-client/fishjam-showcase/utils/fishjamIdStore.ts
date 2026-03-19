let onFishjamIdChangeCallback: ((id: string) => void) | null = null;

export function setFishjamIdChangeCallback(callback: (id: string) => void) {
  onFishjamIdChangeCallback = callback;
}

export function clearFishjamIdChangeCallback() {
  onFishjamIdChangeCallback = null;
}

export function changeFishjamId(id: string) {
  onFishjamIdChangeCallback?.(id);
}
