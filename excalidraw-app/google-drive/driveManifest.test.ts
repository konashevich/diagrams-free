import { describe, expect, it } from "vitest";

import { manifestScenesEqual, manifestScenesForLocalIds, mergeDriveManifests } from "./driveManifest";

import type { DriveManifest } from "./types";

const entry = (
  id: string,
  updatedAt: number,
  title = "Scene",
  driveFileId = `file-${id}`,
) => ({
  id,
  title,
  updatedAt,
  driveFileId,
});

const manifest = (
  scenes: ReturnType<typeof entry>[],
  updatedAt = 100,
): DriveManifest => ({
  version: 1,
  updatedAt,
  scenes,
});

describe("mergeDriveManifests", () => {
  it("merges scenes keeping newer updatedAt per id", () => {
    const merged = mergeDriveManifests(
      manifest([entry("a", 50), entry("b", 50)]),
      manifest([entry("a", 200), entry("c", 75)], 150),
    );

    expect(merged?.scenes.map((scene) => scene.id).sort()).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(merged?.scenes.find((scene) => scene.id === "a")?.updatedAt).toBe(
      200,
    );
  });

  it("returns null when all inputs are empty", () => {
    expect(mergeDriveManifests(null, undefined)).toBeNull();
  });

  it("migration window: nested newer for overlap, flat keeps its own scene", () => {
    // Flat (legacy) has A,B,C but is older; nested has newer A,B after another
    // device edited. Merged read must surface nested A,B and retain flat C.
    const flat = manifest(
      [entry("a", 100), entry("b", 100), entry("c", 100)],
      100,
    );
    const nested = manifest(
      [entry("a", 300, "Scene", "nested-a"), entry("b", 300, "Scene", "nested-b")],
      300,
    );

    const merged = mergeDriveManifests(nested, flat);

    expect(merged?.updatedAt).toBe(300);
    expect(merged?.scenes.find((s) => s.id === "a")?.driveFileId).toBe(
      "nested-a",
    );
    expect(merged?.scenes.find((s) => s.id === "b")?.updatedAt).toBe(300);
    expect(merged?.scenes.find((s) => s.id === "c")?.driveFileId).toBe(
      "file-c",
    );
  });
});

describe("manifestScenesEqual", () => {
  it("detects metadata changes", () => {
    const left = manifest([entry("a", 100, "One")]).scenes;
    const right = manifest([entry("a", 100, "Two")]).scenes;
    expect(manifestScenesEqual(left, right)).toBe(false);
  });

  it("returns true for identical scene lists", () => {
    const scenes = manifest([entry("a", 100), entry("b", 200)]).scenes;
    expect(manifestScenesEqual(scenes, [...scenes])).toBe(true);
  });
});

describe("manifestScenesForLocalIds", () => {
  it("ignores flat-only scenes when comparing write manifest", () => {
    const writeManifest = manifest([entry("a", 100), entry("b", 100)]);
    const merged = mergeDriveManifests(
      writeManifest,
      manifest([entry("a", 100), entry("b", 100), entry("c", 100)]),
    );
    const localIds = new Set(["a", "b"]);
    const nextScenes = manifestScenesForLocalIds(writeManifest, localIds);
    const priorWriteScenes = manifestScenesForLocalIds(writeManifest, localIds);

    expect(manifestScenesEqual(nextScenes, priorWriteScenes)).toBe(true);
    expect(manifestScenesEqual(nextScenes, merged!.scenes)).toBe(false);
  });
});
