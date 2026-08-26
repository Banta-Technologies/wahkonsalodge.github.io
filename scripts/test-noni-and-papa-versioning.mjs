#!/usr/bin/env node

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  filesHaveSameContent,
  logicalSlugFromAsset,
  planComicAssetVersion,
} from "./noni-and-papa-versioning.mjs";

const slug = "test-comic";
const extension = ".png";

const version1 = planComicAssetVersion({
  slug,
  extension,
  isNew: true,
  currentVersion: undefined,
  currentAssetExists: false,
  sourceMatchesCurrent: false,
});
assert.equal(version1.version, 1);
assert.equal(version1.imageFilename, "test-comic-v1.png");
assert.equal(version1.thumbnailFilename, "test-comic-v1.jpg");

const fixtureRoot = await mkdtemp(
  path.join(os.tmpdir(), "noni-papa-versioning-"),
);
try {
  const sourcePath = path.join(fixtureRoot, "test-comic.png");
  const currentPath = path.join(fixtureRoot, "test-comic-v1.png");
  await Promise.all([
    writeFile(sourcePath, "version one bytes"),
    writeFile(currentPath, "version one bytes"),
  ]);

  const unchangedVersion1 = planComicAssetVersion({
    slug,
    extension,
    isNew: false,
    currentVersion: 1,
    currentAssetExists: true,
    sourceMatchesCurrent: await filesHaveSameContent(sourcePath, currentPath),
  });
  assert.equal(unchangedVersion1.version, 1);
  assert.equal(unchangedVersion1.reason, "unchanged");
  assert.equal(unchangedVersion1.metadataChanged, false);

  await writeFile(sourcePath, "different version two bytes");
  const version2 = planComicAssetVersion({
    slug,
    extension,
    isNew: false,
    currentVersion: 1,
    currentAssetExists: true,
    sourceMatchesCurrent: await filesHaveSameContent(sourcePath, currentPath),
  });
  assert.equal(version2.version, 2);
  assert.equal(version2.imageFilename, "test-comic-v2.png");
  assert.equal(version2.thumbnailFilename, "test-comic-v2.jpg");
  assert.equal(version2.metadataChanged, true);

  const version2Path = path.join(fixtureRoot, version2.imageFilename);
  await writeFile(version2Path, "different version two bytes");
  const unchangedVersion2 = planComicAssetVersion({
    slug,
    extension,
    isNew: false,
    currentVersion: 2,
    currentAssetExists: true,
    sourceMatchesCurrent: await filesHaveSameContent(sourcePath, version2Path),
  });
  assert.equal(unchangedVersion2.version, 2);
  assert.equal(unchangedVersion2.reason, "unchanged");
  assert.equal(unchangedVersion2.metadataChanged, false);
  assert.equal(
    logicalSlugFromAsset(unchangedVersion2.imageFilename, 2),
    "test-comic",
  );
} finally {
  await rm(fixtureRoot, { recursive: true, force: true });
}

const revisedLegacy = planComicAssetVersion({
  slug: "legacy-comic",
  extension,
  isNew: false,
  currentVersion: undefined,
  currentAssetExists: true,
  sourceMatchesCurrent: false,
});
assert.equal(revisedLegacy.version, 2);
assert.equal(revisedLegacy.imageFilename, "legacy-comic-v2.png");

console.log(
  "PASS Noni & Papa asset versioning: new v1, idempotent v1, revised v2, idempotent v2, and legacy transition",
);
