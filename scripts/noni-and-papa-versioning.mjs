import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const POSITIVE_VERSION = /^[1-9]\d*$/;

async function hashFile(filePath) {
  const hash = createHash("sha256");
  hash.update(await readFile(filePath));
  return hash.digest("hex");
}

export async function filesHaveSameContent(leftPath, rightPath) {
  const [leftStats, rightStats] = await Promise.all([
    stat(leftPath),
    stat(rightPath),
  ]);
  if (leftStats.size !== rightStats.size) {
    return false;
  }

  const [leftHash, rightHash] = await Promise.all([
    hashFile(leftPath),
    hashFile(rightPath),
  ]);
  return leftHash === rightHash;
}

export function assertAssetVersion(version, context) {
  if (!Number.isInteger(version) || version < 1) {
    throw new Error(`${context} must use a positive integer version.`);
  }
}

export function versionedAssetFilename(slug, version, extension) {
  assertAssetVersion(version, `Comic "${slug}"`);
  const normalizedExtension = extension.startsWith(".")
    ? extension
    : `.${extension}`;
  return `${slug}-v${version}${normalizedExtension}`;
}

export function logicalSlugFromAsset(filename, declaredVersion) {
  const assetSlug = path.basename(filename, path.extname(filename));
  if (declaredVersion === undefined) {
    return assetSlug;
  }

  assertAssetVersion(declaredVersion, `Asset "${filename}"`);
  const suffix = `-v${declaredVersion}`;
  if (!assetSlug.endsWith(suffix)) {
    throw new Error(`Versioned asset "${filename}" must end with "${suffix}".`);
  }

  return assetSlug.slice(0, -suffix.length);
}

export function parseVersionedAssetSlug(filename) {
  const assetSlug = path.basename(filename, path.extname(filename));
  const match = assetSlug.match(/^(.*)-v([1-9]\d*)$/);
  if (!match || !POSITIVE_VERSION.test(match[2])) {
    return { slug: assetSlug, version: undefined };
  }

  return { slug: match[1], version: Number(match[2]) };
}

export function planComicAssetVersion({
  slug,
  extension,
  isNew,
  currentVersion,
  currentAssetExists,
  sourceMatchesCurrent,
}) {
  if (currentVersion !== undefined) {
    assertAssetVersion(currentVersion, `Comic "${slug}"`);
  }

  let version = currentVersion;
  let reason = "unchanged";

  if (isNew) {
    version = 1;
    reason = "new";
  } else if (!currentAssetExists && currentVersion !== undefined) {
    reason = "seed-versioned-asset";
  } else if (!currentAssetExists) {
    throw new Error(
      `Current website asset is missing for legacy comic "${slug}".`,
    );
  } else if (!sourceMatchesCurrent) {
    version = (currentVersion ?? 1) + 1;
    reason = "revised";
  }

  const imageFilename =
    version === undefined
      ? `${slug}${extension}`
      : versionedAssetFilename(slug, version, extension);
  const thumbnailFilename =
    version === undefined
      ? `${slug}.jpg`
      : versionedAssetFilename(slug, version, ".jpg");

  return {
    version,
    reason,
    imageFilename,
    thumbnailFilename,
    metadataChanged: version !== currentVersion,
    needsPublish: reason !== "unchanged",
  };
}
