export class Deferred<T, E = unknown> {
  public promise: Promise<T>;

  private resolveFn: (value: PromiseLike<T> | T) => void = () => null;
  private rejectFn: (reason?: E) => void = () => null;

  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this.resolveFn = resolve;
      this.rejectFn = reject;
    });
  }

  public resolve(value: T) {
    this.resolveFn(value);
  }

  public reject(reason?: E) {
    this.rejectFn(reason);
  }
}
