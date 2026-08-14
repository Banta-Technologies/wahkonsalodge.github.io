import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const VALID_FULL_IMAGE = /^[a-z0-9]+(?:-[a-z0-9]+)*\.png$/;
const VALID_THUMBNAIL = /^[a-z0-9]+(?:-[a-z0-9]+)*\.jpg$/;
const LATEST_PATTERN = /export const latestNoniAndPapaSlug = "([a-z0-9-]+)";/;
const DATA_ARRAY_START = "export const noniAndPapaItems = [";
const DATA_ARRAY_END = "] as const;";

function slugOf(filename) {
  return path.basename(filename, path.extname(filename));
}

function parseComicData(source, dataPath) {
  const latestMatch = source.match(LATEST_PATTERN);
  if (!latestMatch) {
    throw new Error(`Missing or invalid latestNoniAndPapaSlug in ${dataPath}`);
  }

  const arrayStart = source.indexOf(DATA_ARRAY_START);
  const arrayEnd = source.indexOf(DATA_ARRAY_END, arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`Unable to locate noniAndPapaItems in ${dataPath}`);
  }

  const arraySource = source.slice(arrayStart, arrayEnd);
  const itemPattern =
    /\{\s*title:\s*("(?:\\.|[^"\\])*")\s*,\s*image:\s*"([^"]+)"\s*,\s*thumb:\s*"([^"]+)"\s*,\s*\}/g;
  const items = [];
  let match;

  while ((match = itemPattern.exec(arraySource)) !== null) {
    items.push({
      title: JSON.parse(match[1]),
      image: match[2],
      thumb: match[3],
    });
  }

  const declaredImages = [...arraySource.matchAll(/\bimage:\s*"/g)].length;
  if (items.length === 0 || items.length !== declaredImages) {
    throw new Error(
      `Unable to parse every Noni & Papa metadata record in ${dataPath}`,
    );
  }

  return { latest: latestMatch[1], items };
}

async function listAssetFiles(directoryPath) {
  return (await readdir(directoryPath, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== ".gitkeep")
    .map((entry) => entry.name)
    .sort();
}

export async function checkNoniAndPapa(repositoryRoot) {
  const dataPath = path.join(repositoryRoot, "src", "data", "noni-and-papa.ts");
  const imageRoot = path.join(
    repositoryRoot,
    "public",
    "images",
    "noni-and-papa",
  );
  const thumbnailRoot = path.join(imageRoot, "thumbs");
  const source = await readFile(dataPath, "utf8");
  const data = parseComicData(source, path.relative(repositoryRoot, dataPath));
  const fullImages = (await listAssetFiles(imageRoot)).filter(
    (filename) => filename !== "banner-evolved.png",
  );
  const thumbnails = await listAssetFiles(thumbnailRoot);
  const problems = [];

  for (const filename of fullImages) {
    if (!VALID_FULL_IMAGE.test(filename)) {
      problems.push(`Invalid full-size comic filename: ${filename}`);
    }
  }
  for (const filename of thumbnails) {
    if (!VALID_THUMBNAIL.test(filename)) {
      problems.push(`Invalid thumbnail filename: ${filename}`);
    }
  }

  const metadataSlugs = new Set();
  for (const item of data.items) {
    const imageFilename = path.posix.basename(item.image);
    const thumbnailFilename = path.posix.basename(item.thumb);
    const imageSlug = slugOf(imageFilename);
    const thumbnailSlug = slugOf(thumbnailFilename);

    if (!item.title.trim()) {
      problems.push(`Comic "${imageSlug}" has an empty title`);
    }
    if (metadataSlugs.has(imageSlug)) {
      problems.push(`Duplicate gallery comic slug: ${imageSlug}`);
    }
    metadataSlugs.add(imageSlug);

    if (!VALID_FULL_IMAGE.test(imageFilename)) {
      problems.push(`Invalid metadata comic filename: ${item.image}`);
    }
    if (!VALID_THUMBNAIL.test(thumbnailFilename)) {
      problems.push(`Invalid metadata thumbnail filename: ${item.thumb}`);
    }
    if (imageSlug !== thumbnailSlug) {
      problems.push(
        `Comic and thumbnail slugs do not match: ${imageSlug} / ${thumbnailSlug}`,
      );
    }

    const expectedImage = `/images/noni-and-papa/${imageFilename}`;
    const expectedThumbnail = `/images/noni-and-papa/thumbs/${thumbnailFilename}`;
    if (item.image !== expectedImage) {
      problems.push(`Unexpected comic path for "${imageSlug}": ${item.image}`);
    }
    if (item.thumb !== expectedThumbnail) {
      problems.push(
        `Unexpected thumbnail path for "${imageSlug}": ${item.thumb}`,
      );
    }
  }

  const fullImageSlugs = new Set(fullImages.map(slugOf));
  const thumbnailSlugs = new Set(thumbnails.map(slugOf));

  for (const slug of metadataSlugs) {
    if (!fullImageSlugs.has(slug)) {
      problems.push(`Metadata points to a missing full-size comic: ${slug}`);
    }
    if (!thumbnailSlugs.has(slug)) {
      problems.push(`Metadata points to a missing thumbnail: ${slug}`);
    }
  }
  for (const slug of fullImageSlugs) {
    if (!metadataSlugs.has(slug)) {
      problems.push(`Full-size comic has no metadata record: ${slug}`);
    }
    if (!thumbnailSlugs.has(slug)) {
      problems.push(`Full-size comic has no matching thumbnail: ${slug}`);
    }
  }
  for (const slug of thumbnailSlugs) {
    if (!metadataSlugs.has(slug)) {
      problems.push(`Orphaned thumbnail: ${slug}`);
    }
    if (!fullImageSlugs.has(slug)) {
      problems.push(`Thumbnail has no matching full-size comic: ${slug}`);
    }
  }

  if (!metadataSlugs.has(data.latest)) {
    problems.push(
      `Latest comic slug is not a valid gallery comic: ${data.latest}`,
    );
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n"));
  }

  return `${metadataSlugs.size} comics, ${thumbnailSlugs.size} thumbnails; latest: ${data.latest}`;
}
