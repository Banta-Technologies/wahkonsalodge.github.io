import { readdir } from "node:fs/promises";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([
  ".ai",
  ".aseprite",
  ".blend",
  ".kra",
  ".psd",
  ".xcf",
]);
const GARBAGE_NAMES = new Set([".ds_store", "thumbs.db"]);
const GARBAGE_EXTENSIONS = new Set([".bak", ".swp", ".swo", ".tmp"]);

async function walkFiles(directoryPath) {
  const entries = await readdir(directoryPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(entryPath)));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  }

  return files;
}

function isDisallowed(filename) {
  const lowercaseName = filename.toLowerCase();
  const extension = path.extname(lowercaseName);

  return (
    SOURCE_EXTENSIONS.has(extension) ||
    GARBAGE_NAMES.has(lowercaseName) ||
    GARBAGE_EXTENSIONS.has(extension) ||
    lowercaseName.endsWith("~")
  );
}

export async function checkPublicAssets(repositoryRoot) {
  const publicRoot = path.join(repositoryRoot, "public");
  const files = await walkFiles(publicRoot);
  const offenders = files
    .filter((filePath) => isDisallowed(path.basename(filePath)))
    .map((filePath) => path.relative(repositoryRoot, filePath))
    .sort();

  if (offenders.length > 0) {
    throw new Error(
      `Disallowed source or temporary files found:\n\n${offenders.join(
        "\n",
      )}\n\nCreative source files belong in the external master archive, not the website repo.`,
    );
  }

  return `${files.length} public files inspected`;
}
