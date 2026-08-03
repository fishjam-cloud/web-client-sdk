export class Deferred<T> {
  readonly promise: Promise<T>;
  private resolvePromise!: (value: T | PromiseLike<T>) => void;
  private rejectPromise!: (reason?: unknown) => void;

  constructor() {
    this.promise = new Promise<T>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  }

  resolve(value: T | PromiseLike<T>): void {
    this.resolvePromise(value);
  }

  reject(reason?: unknown): void {
    this.rejectPromise(reason);
  }
}
