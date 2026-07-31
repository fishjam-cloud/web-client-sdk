import { describe, expect, it } from "vitest";

import { FishjamError } from "./FishjamError";
import { ClientDisposedError } from "./lifecycleErrors";

describe("ClientDisposedError", () => {
  it("keeps the message the lifecycle machinery and its tests rely on", () => {
    expect(new ClientDisposedError().message).toBe("FishjamClient has been disposed and cannot be used again");
  });

  it("is a fatal FishjamError with a stable name", () => {
    const error = new ClientDisposedError();

    expect(error).toBeInstanceOf(FishjamError);
    expect(error.name).toBe("ClientDisposedError");
    expect(error.recoverability).toBe("fatal");
  });
});
