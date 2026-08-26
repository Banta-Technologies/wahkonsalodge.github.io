#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  access,
  copyFile,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import {
  filesHaveSameContent,
  logicalSlugFromAsset,
  parseVersionedAssetSlug,
  planComicAssetVersion,
  versionedAssetFilename,
} from "./noni-and-papa-versioning.mjs";

const VALID_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FULL_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);
const THUMBNAIL_EXTENSIONS = new Set([".jpg", ".jpeg"]);
const THUMBNAIL_HEIGHT = 600;
const THUMBNAIL_QUALITY = 88;
const DATA_ARRAY_START = "export const noniAndPapaItems = [";
const DATA_ARRAY_END = "] as const;";
const LATEST_PATTERN = /export const latestNoniAndPapaSlug = "([a-z0-9-]+)";/;

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const websiteImageRoot = path.join(
  repositoryRoot,
  "public",
  "images",
  "noni-and-papa",
);
const websiteThumbnailRoot = path.join(websiteImageRoot, "thumbs");
const comicDataPath = path.join(
  repositoryRoot,
  "src",
  "data",
  "noni-and-papa.ts",
);

function printHelp() {
  console.log(`Usage: pnpm noni-papa:sync [options]

Options:
  --dry-run          Validate and report changes without writing or building
  --latest <slug>    Set the explicit homepage latest-comic slug
  --help             Show this help

Environment:
  NONI_PAPA_MASTER   Override the default master archive location`);
}

function parseArguments(argumentsList) {
  const options = { dryRun: false, latest: undefined };

  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];

    if (argument === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (argument === "--help") {
      options.help = true;
      continue;
    }

    if (argument === "--latest") {
      const slug = argumentsList[index + 1];
      if (!slug || slug.startsWith("--")) {
        throw new Error(
          "--latest requires a comic slug, such as catching-zzzs.",
        );
      }
      options.latest = slug;
      index += 1;
      continue;
    }

    if (argument.startsWith("--latest=")) {
      options.latest = argument.slice("--latest=".length);
      if (!options.latest) {
        throw new Error("--latest requires a non-empty comic slug.");
      }
      continue;
    }

    throw new Error(`Unknown option: ${argument}`);
  }

  if (options.latest && !VALID_SLUG.test(options.latest)) {
    throw new Error(
      `Invalid latest-comic slug "${options.latest}". Use lowercase kebab-case.`,
    );
  }

  return options;
}

function resolveMasterRoot() {
  const configuredRoot = process.env.NONI_PAPA_MASTER?.trim();
  const defaultMasterRoot = path.join(
    os.homedir(),
    "Desktop",
    "WahkonsaLodge",
    "noni_and_papa",
  );

  if (!configuredRoot) {
    return defaultMasterRoot;
  }

  if (configuredRoot === "~") {
    return os.homedir();
  }

  if (configuredRoot.startsWith(`~${path.sep}`)) {
    return path.join(os.homedir(), configuredRoot.slice(2));
  }

  return path.resolve(configuredRoot);
}

async function assertDirectory(directoryPath, label) {
  let directoryStats;
  try {
    directoryStats = await stat(directoryPath);
  } catch {
    throw new Error(`${label} does not exist: ${directoryPath}`);
  }

  if (!directoryStats.isDirectory()) {
    throw new Error(`${label} is not a directory: ${directoryPath}`);
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function extensionOf(filename) {
  return path.extname(filename).toLowerCase();
}

function slugOf(filename) {
  return path.basename(filename, path.extname(filename));
}

function assertValidSlug(slug, filePath) {
  if (!VALID_SLUG.test(slug)) {
    throw new Error(
      `Invalid comic slug "${slug}" in ${filePath}. Use lowercase kebab-case.`,
    );
  }
}

async function inspectImage(filePath, kind) {
  let metadata;
  try {
    metadata = await sharp(filePath).metadata();
  } catch (error) {
    throw new Error(
      `Unable to read ${kind} image ${filePath}: ${error.message}`,
    );
  }

  if (!metadata.width || !metadata.height || !metadata.format) {
    throw new Error(`Invalid ${kind} image: ${filePath}`);
  }

  return metadata;
}

async function inspectAssetDirectory(directoryPath, kind, allowedExtensions) {
  const entries = (await readdir(directoryPath, { withFileTypes: true })).sort(
    (left, right) => left.name.localeCompare(right.name),
  );
  const assets = new Map();
  const ignored = [];

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    if (entry.name === ".gitkeep" || entry.name === ".DS_Store") {
      continue;
    }

    const extension = extensionOf(entry.name);
    if (!allowedExtensions.has(extension)) {
      ignored.push(entry.name);
      continue;
    }

    const slug = slugOf(entry.name);
    assertValidSlug(slug, path.join(directoryPath, entry.name));

    if (assets.has(slug)) {
      throw new Error(
        `Duplicate ${kind} slug "${slug}": ${assets.get(slug).filename} and ${entry.name}`,
      );
    }

    const filePath = path.join(directoryPath, entry.name);
    const [fileStats, metadata] = await Promise.all([
      stat(filePath),
      inspectImage(filePath, kind),
    ]);
    assets.set(slug, {
      slug,
      filename: entry.name,
      extension,
      path: filePath,
      mtimeMs: fileStats.mtimeMs,
      metadata,
    });
  }

  return { assets, ignored };
}

function validateThumbnail(thumbnail) {
  if (thumbnail.metadata.format !== "jpeg") {
    throw new Error(`Thumbnail must be a JPEG: ${thumbnail.path}`);
  }

  if (thumbnail.metadata.height > THUMBNAIL_HEIGHT) {
    throw new Error(
      `Thumbnail is taller than ${THUMBNAIL_HEIGHT}px: ${thumbnail.path}`,
    );
  }
}

function parseComicData(source) {
  const latestMatch = source.match(LATEST_PATTERN);
  if (!latestMatch) {
    throw new Error(
      `Missing latestNoniAndPapaSlug export in ${comicDataPath}.`,
    );
  }

  const arrayStart = source.indexOf(DATA_ARRAY_START);
  const arrayEnd = source.indexOf(DATA_ARRAY_END, arrayStart);
  if (arrayStart === -1 || arrayEnd === -1) {
    throw new Error(`Unable to locate the comic array in ${comicDataPath}.`);
  }

  const arraySource = source.slice(arrayStart, arrayEnd);
  const itemPattern =
    /  \{\s*title:\s*("(?:\\.|[^"\\])*")\s*,\s*(?:version:\s*([1-9]\d*)\s*,\s*)?image:\s*"([^"]+)"\s*,\s*thumb:\s*"([^"]+)"\s*,\s*\}/g;
  const items = [];
  let match;

  while ((match = itemPattern.exec(arraySource)) !== null) {
    const title = JSON.parse(match[1]);
    const version = match[2] === undefined ? undefined : Number(match[2]);
    const image = match[3];
    const thumb = match[4];
    const filename = path.posix.basename(image);
    const thumbnailFilename = path.posix.basename(thumb);
    const slug = logicalSlugFromAsset(filename, version);
    const thumbnailSlug = logicalSlugFromAsset(thumbnailFilename, version);
    if (slug !== thumbnailSlug) {
      throw new Error(
        `Comic-data image and thumbnail do not share a logical slug: ${image} / ${thumb}`,
      );
    }
    items.push({
      title,
      version,
      image,
      thumb,
      slug,
      raw: match[0],
    });
  }

  if (items.length === 0) {
    throw new Error(`No comic records found in ${comicDataPath}.`);
  }

  return { latest: latestMatch[1], items };
}

function titleFromSlug(slug) {
  const titleSlug = slug
    .replace(/^noni-and-papa-/, "")
    .replace(/-comic-strip$/, "");
  return titleSlug
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function comicBlock({ title, version, imageFilename, thumbnailFilename }) {
  const versionLine = version === undefined ? "" : `    version: ${version},\n`;
  return `  {
    title: ${JSON.stringify(title)},
${versionLine}    image: "/images/noni-and-papa/${imageFilename}",
    thumb: "/images/noni-and-papa/thumbs/${thumbnailFilename}",
  },`;
}

function updateComicData(source, newRecords, replacementRecords, latestSlug) {
  let updatedSource = source;

  for (const { item, record } of replacementRecords) {
    if (!updatedSource.includes(item.raw)) {
      throw new Error(
        `Unable to update the comic-data record for "${item.slug}".`,
      );
    }
    updatedSource = updatedSource.replace(item.raw, comicBlock(record));
  }

  if (newRecords.length > 0) {
    const markerIndex = updatedSource.indexOf(DATA_ARRAY_END);
    if (markerIndex === -1) {
      throw new Error(`Unable to update the comic array in ${comicDataPath}.`);
    }
    const blocks = newRecords.map(comicBlock).join("\n");
    updatedSource =
      updatedSource.slice(0, markerIndex) +
      `${blocks}\n` +
      updatedSource.slice(markerIndex);
  }

  updatedSource = updatedSource.replace(
    LATEST_PATTERN,
    `export const latestNoniAndPapaSlug = "${latestSlug}";`,
  );

  return updatedSource;
}

async function compareFiles(sourcePath, destinationPath) {
  if (!(await fileExists(destinationPath))) {
    return "added";
  }

  return (await filesHaveSameContent(sourcePath, destinationPath))
    ? "unchanged"
    : "updated";
}

async function replaceFileAtomically(sourcePath, destinationPath) {
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.tmp`,
  );

  try {
    await copyFile(sourcePath, temporaryPath);
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function writeFileAtomically(destinationPath, contents) {
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.tmp`,
  );

  try {
    await writeFile(temporaryPath, contents, "utf8");
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

async function generateThumbnail(sourcePath, destinationPath) {
  const temporaryPath = path.join(
    path.dirname(destinationPath),
    `.${path.basename(destinationPath)}.${process.pid}.tmp.jpg`,
  );

  try {
    await sharp(sourcePath)
      .resize({ height: THUMBNAIL_HEIGHT, withoutEnlargement: true })
      .jpeg({ quality: THUMBNAIL_QUALITY })
      .toFile(temporaryPath);
    await rename(temporaryPath, destinationPath);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

function relativeWebsitePath(filePath) {
  return path.relative(repositoryRoot, filePath);
}

function relativeMasterPath(masterRoot, filePath) {
  return path.relative(masterRoot, filePath);
}

async function runBuild() {
  const command = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  return new Promise((resolve, reject) => {
    const child = spawn(command, ["build"], {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code === 0));
  });
}

function printList(label, values) {
  console.log(`${label}: ${values.length}`);
  for (const value of values) {
    console.log(`  - ${value}`);
  }
}

function printReport(report) {
  console.log("\nNoni & Papa sync report");
  console.log(`Master archive: ${report.masterRoot}`);
  console.log(`Mode: ${report.dryRun ? "dry run" : "synchronize"}`);
  printList(
    report.dryRun ? "Files that would be added" : "Files added",
    report.added,
  );
  printList(
    report.dryRun ? "Files that would be updated" : "Files updated",
    report.updated,
  );
  printList("Files skipped (unchanged)", report.unchanged);
  printList(
    report.dryRun
      ? "Master thumbnails that would be generated"
      : "Master thumbnails generated",
    report.generated,
  );
  printList("Missing or mismatched assets", report.mismatches);
  printList("Warnings", report.warnings);
  console.log(`Comic count: ${report.comicCount}`);
  console.log(`Thumbnail count: ${report.thumbnailCount}`);
  console.log(`Latest comic: ${report.latest}`);
  console.log(`Comic data: ${report.dataResult}`);
  console.log(`Build result: ${report.buildResult}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const masterRoot = resolveMasterRoot();
  const masterPublishedRoot = path.join(masterRoot, "comics", "published");
  const masterThumbnailRoot = path.join(masterRoot, "comics", "thumbnails");

  await Promise.all([
    assertDirectory(masterRoot, "Noni & Papa master archive"),
    assertDirectory(masterPublishedRoot, "Master published-comics directory"),
    assertDirectory(masterThumbnailRoot, "Master thumbnail directory"),
    assertDirectory(websiteImageRoot, "Website comic-image directory"),
    assertDirectory(websiteThumbnailRoot, "Website comic-thumbnail directory"),
  ]);

  const [
    publishedInspection,
    thumbnailInspection,
    websiteComicInspection,
    websiteThumbInspection,
  ] = await Promise.all([
    inspectAssetDirectory(
      masterPublishedRoot,
      "published comic",
      FULL_IMAGE_EXTENSIONS,
    ),
    inspectAssetDirectory(
      masterThumbnailRoot,
      "thumbnail",
      THUMBNAIL_EXTENSIONS,
    ),
    inspectAssetDirectory(
      websiteImageRoot,
      "website comic",
      FULL_IMAGE_EXTENSIONS,
    ),
    inspectAssetDirectory(
      websiteThumbnailRoot,
      "website thumbnail",
      THUMBNAIL_EXTENSIONS,
    ),
  ]);

  const published = publishedInspection.assets;
  const thumbnails = thumbnailInspection.assets;
  const warnings = [];
  const mismatches = [];

  for (const name of publishedInspection.ignored) {
    warnings.push(`Ignored unsupported master published file: ${name}`);
  }
  for (const name of thumbnailInspection.ignored) {
    warnings.push(`Ignored unsupported master thumbnail file: ${name}`);
  }

  if (published.size === 0) {
    throw new Error(`No published comics found in ${masterPublishedRoot}.`);
  }

  for (const thumbnail of thumbnails.values()) {
    validateThumbnail(thumbnail);
  }

  for (const slug of thumbnails.keys()) {
    if (!published.has(slug)) {
      mismatches.push(`Thumbnail has no published comic: ${slug}`);
    }
  }
  if (mismatches.length > 0) {
    throw new Error(`Asset validation failed:\n- ${mismatches.join("\n- ")}`);
  }

  const dataSource = await readFile(comicDataPath, "utf8");
  const comicData = parseComicData(dataSource);
  const dataBySlug = new Map();

  for (const item of comicData.items) {
    assertValidSlug(item.slug, comicDataPath);
    if (dataBySlug.has(item.slug)) {
      throw new Error(`Duplicate comic-data slug: ${item.slug}`);
    }
    dataBySlug.set(item.slug, item);

    const masterComic = published.get(item.slug);
    if (!masterComic) {
      throw new Error(
        `Comic data references "${item.slug}", but it is absent from the master archive.`,
      );
    }

    const expectedImageFilename =
      item.version === undefined
        ? masterComic.filename
        : versionedAssetFilename(
            item.slug,
            item.version,
            masterComic.extension,
          );
    const expectedThumbnailFilename =
      item.version === undefined
        ? `${item.slug}.jpg`
        : versionedAssetFilename(item.slug, item.version, ".jpg");
    const expectedImage = `/images/noni-and-papa/${expectedImageFilename}`;
    const expectedThumb = `/images/noni-and-papa/thumbs/${expectedThumbnailFilename}`;
    if (item.image !== expectedImage || item.thumb !== expectedThumb) {
      throw new Error(
        `Comic-data paths do not match the declared asset version for "${item.slug}". Expected ${expectedImage} and ${expectedThumb}.`,
      );
    }
  }

  const newComics = [...published.values()]
    .filter((comic) => !dataBySlug.has(comic.slug))
    .sort(
      (left, right) =>
        left.mtimeMs - right.mtimeMs || left.slug.localeCompare(right.slug),
    );

  const selectedLatest = options.latest ?? comicData.latest;
  if (!published.has(selectedLatest)) {
    throw new Error(
      `Latest comic "${selectedLatest}" does not exist in the master published directory.`,
    );
  }

  const newComicSlugs = new Set(newComics.map((comic) => comic.slug));
  const plans = [];

  for (const comic of published.values()) {
    const item = dataBySlug.get(comic.slug);
    const currentImagePath = item
      ? path.join(websiteImageRoot, path.posix.basename(item.image))
      : undefined;
    const currentAssetExists = currentImagePath
      ? await fileExists(currentImagePath)
      : false;
    const sourceMatchesCurrent = currentAssetExists
      ? (await compareFiles(comic.path, currentImagePath)) === "unchanged"
      : false;
    const decision = planComicAssetVersion({
      slug: comic.slug,
      extension: comic.extension,
      isNew: newComicSlugs.has(comic.slug),
      currentVersion: item?.version,
      currentAssetExists,
      sourceMatchesCurrent,
    });
    plans.push({ comic, item, decision });
  }

  const thumbnailGenerationPlans = plans.filter(
    ({ comic, decision }) =>
      decision.reason === "revised" || !thumbnails.has(comic.slug),
  );
  const generated = thumbnailGenerationPlans.map(({ comic }) =>
    relativeMasterPath(
      masterRoot,
      path.join(masterThumbnailRoot, `${comic.slug}.jpg`),
    ),
  );

  if (!options.dryRun) {
    for (const { comic } of thumbnailGenerationPlans) {
      const thumbnailPath = path.join(masterThumbnailRoot, `${comic.slug}.jpg`);
      await generateThumbnail(comic.path, thumbnailPath);
      const generatedThumbnail = {
        path: thumbnailPath,
        metadata: await inspectImage(thumbnailPath, "generated thumbnail"),
      };
      validateThumbnail(generatedThumbnail);
    }
  }

  const effectiveThumbnails = new Map(thumbnails);
  for (const { comic } of thumbnailGenerationPlans) {
    const thumbnailPath = path.join(masterThumbnailRoot, `${comic.slug}.jpg`);
    effectiveThumbnails.set(comic.slug, {
      slug: comic.slug,
      filename: `${comic.slug}.jpg`,
      extension: ".jpg",
      path: thumbnailPath,
    });
  }

  const recordForPlan = ({ comic, item, decision }) => ({
    title: item?.title ?? titleFromSlug(comic.slug),
    version: decision.version,
    imageFilename: decision.imageFilename,
    thumbnailFilename: decision.thumbnailFilename,
  });
  const planBySlug = new Map(plans.map((plan) => [plan.comic.slug, plan]));
  const newRecords = newComics.map((comic) =>
    recordForPlan(planBySlug.get(comic.slug)),
  );
  const replacementRecords = plans
    .filter(({ item, decision }) => item && decision.metadataChanged)
    .map((plan) => ({ item: plan.item, record: recordForPlan(plan) }));
  const updatedDataSource = updateComicData(
    dataSource,
    newRecords,
    replacementRecords,
    selectedLatest,
  );
  const dataChanged = updatedDataSource !== dataSource;

  const added = [];
  const updated = [];
  const unchanged = [];

  for (const { comic, decision } of plans) {
    const destinationPath = path.join(websiteImageRoot, decision.imageFilename);
    const result = await compareFiles(comic.path, destinationPath);
    const displayPath = relativeWebsitePath(destinationPath);
    if (result === "unchanged") {
      unchanged.push(displayPath);
    } else {
      (result === "added" ? added : updated).push(displayPath);
      if (!options.dryRun) {
        await replaceFileAtomically(comic.path, destinationPath);
      }
    }
  }

  for (const { comic, decision } of plans) {
    const thumbnail = effectiveThumbnails.get(comic.slug);
    if (!thumbnail) {
      throw new Error(`Missing effective thumbnail for "${comic.slug}".`);
    }
    const destinationPath = path.join(
      websiteThumbnailRoot,
      decision.thumbnailFilename,
    );
    let result;
    if (
      options.dryRun &&
      thumbnailGenerationPlans.some(
        ({ comic: generatedComic }) => generatedComic.slug === comic.slug,
      )
    ) {
      result = (await fileExists(destinationPath)) ? "updated" : "added";
    } else {
      result = await compareFiles(thumbnail.path, destinationPath);
    }
    const displayPath = relativeWebsitePath(destinationPath);
    if (result === "unchanged") {
      unchanged.push(displayPath);
    } else {
      (result === "added" ? added : updated).push(displayPath);
      if (!options.dryRun) {
        await replaceFileAtomically(thumbnail.path, destinationPath);
      }
    }
  }

  if (dataChanged) {
    const displayPath = relativeWebsitePath(comicDataPath);
    ((await fileExists(comicDataPath)) ? updated : added).push(displayPath);
    if (!options.dryRun) {
      await writeFileAtomically(comicDataPath, updatedDataSource);
    }
  } else {
    unchanged.push(relativeWebsitePath(comicDataPath));
  }

  for (const asset of websiteComicInspection.assets.values()) {
    const { slug } = parseVersionedAssetSlug(asset.filename);
    if (slug !== "banner-evolved" && !published.has(slug)) {
      warnings.push(
        `Website comic is not in the master archive and was preserved: ${slug}`,
      );
    }
  }
  for (const asset of websiteThumbInspection.assets.values()) {
    const { slug } = parseVersionedAssetSlug(asset.filename);
    if (!published.has(slug)) {
      warnings.push(
        `Website thumbnail is not in the master archive and was preserved: ${slug}`,
      );
    }
  }

  let buildResult = "skipped (dry run)";
  if (!options.dryRun) {
    const buildPassed = await runBuild();
    buildResult = buildPassed ? "passed" : "failed";
    if (!buildPassed) {
      const report = {
        masterRoot,
        dryRun: false,
        added,
        updated,
        unchanged,
        generated,
        mismatches,
        warnings,
        comicCount: published.size,
        thumbnailCount: effectiveThumbnails.size,
        latest: selectedLatest,
        dataResult: dataChanged ? "updated" : "unchanged",
        buildResult,
      };
      printReport(report);
      process.exitCode = 1;
      return;
    }
  }

  printReport({
    masterRoot,
    dryRun: options.dryRun,
    added,
    updated,
    unchanged,
    generated,
    mismatches,
    warnings,
    comicCount: published.size,
    thumbnailCount: effectiveThumbnails.size,
    latest: selectedLatest,
    dataResult: dataChanged
      ? options.dryRun
        ? "would update"
        : "updated"
      : "unchanged",
    buildResult,
  });
}

main().catch((error) => {
  console.error(`\nNoni & Papa sync failed: ${error.message}`);
  process.exitCode = 1;
});
