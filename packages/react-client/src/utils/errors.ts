export class MissingSandboxApiUrlError extends Error {
  constructor() {
    super("useSandbox requires a sandboxApiUrl, you can get it at: https://fishjam.io/app/sandbox");
    this.name = "MissingSandboxApiUrlError";
  }
}
