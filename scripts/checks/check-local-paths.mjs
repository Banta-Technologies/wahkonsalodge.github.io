import { readFile } from "node:fs/promises";
import path from "node:path";
import { listProjectFiles } from "./project-files.mjs";

const TEXT_EXTENSIONS = new Set([
  ".astro",
  ".cjs",
  ".css",
  ".cts",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mdx",
  ".mjs",
  ".mts",
  ".scss",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);
const TEXT_FILENAMES = new Set([
  ".gitignore",
  ".prettierignore",
  ".prettierrc",
]);
const DEVELOPER_PATH = new RegExp(
  `/(?:${["home", "Users"].join("|")})/[A-Za-z0-9._-]+/`,
  "g",
);

function isProjectTextFile(filename) {
  return (
    TEXT_FILENAMES.has(path.basename(filename)) ||
    TEXT_EXTENSIONS.has(path.extname(filename).toLowerCase())
  );
}

export async function checkLocalPaths(repositoryRoot) {
  const files = (await listProjectFiles(repositoryRoot)).filter(
    isProjectTextFile,
  );
  const offenders = [];

  for (const filename of files) {
    const contents = await readFile(
      path.join(repositoryRoot, filename),
      "utf8",
    );
    const lines = contents.split(/\r?\n/);

    for (const [index, line] of lines.entries()) {
      DEVELOPER_PATH.lastIndex = 0;
      const matches = [...line.matchAll(DEVELOPER_PATH)];
      for (const match of matches) {
        offenders.push(`${filename}:${index + 1}: ${match[0]}`);
      }
    }
  }

  if (offenders.length > 0) {
    throw new Error(
      `Developer-specific absolute paths found:\n\n${offenders.join(
        "\n",
      )}\n\nUse os.homedir(), an environment variable, or a project-relative path instead.`,
    );
  }

  return `${files.length} project text files inspected`;
}
