import { describe, expect, it, vi } from "vitest";

import { runDriveMergeSerialized } from "./driveMergeLock";

describe("runDriveMergeSerialized", () => {
  it("runs only one merge at a time and shares the result", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fn = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return { pulled: 1, pushed: 0, syncedAt: 1, remoteManifestUpdatedAt: 1, pulledSceneIds: [], activeSceneNeedsReload: null };
    });

    const [a, b] = await Promise.all([
      runDriveMergeSerialized(fn),
      runDriveMergeSerialized(fn),
    ]);

    expect(a).toBe(b);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(maxInFlight).toBe(1);
  });
});
