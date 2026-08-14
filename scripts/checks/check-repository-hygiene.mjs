import { readFile } from "node:fs/promises";
import path from "node:path";
import { listProjectFiles } from "./project-files.mjs";

const ALLOWED_ENV_TEMPLATES = new Set([
  ".env.example",
  ".env.sample",
  ".env.template",
]);
const GARBAGE_NAMES = new Set([".ds_store", "thumbs.db"]);
const GARBAGE_EXTENSIONS = new Set([".bak", ".swp", ".swo", ".tmp"]);
const REQUIRED_IGNORE_RULES = [
  ".env",
  ".env.*",
  "!.env.example",
  ".DS_Store",
  "Thumbs.db",
  "*.swp",
  "*.swo",
  "*~",
  "*.bak",
  "*.tmp",
];

function isSecretFile(filename) {
  const basename = path.basename(filename);
  return (
    basename === ".env" ||
    (basename.startsWith(".env.") && !ALLOWED_ENV_TEMPLATES.has(basename))
  );
}

function isGarbageFile(filename) {
  const basename = path.basename(filename).toLowerCase();
  return (
    GARBAGE_NAMES.has(basename) ||
    GARBAGE_EXTENSIONS.has(path.extname(basename)) ||
    basename.endsWith("~")
  );
}

export async function checkRepositoryHygiene(repositoryRoot) {
  const files = await listProjectFiles(repositoryRoot);
  const secrets = files.filter(isSecretFile);
  const garbage = files.filter(isGarbageFile);
  const gitignore = await readFile(
    path.join(repositoryRoot, ".gitignore"),
    "utf8",
  );
  const ignoreRules = new Set(
    gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#")),
  );
  const missingIgnoreRules = REQUIRED_IGNORE_RULES.filter(
    (rule) => !ignoreRules.has(rule),
  );
  const problems = [];

  if (secrets.length > 0) {
    problems.push(`Local secret/config files found:\n${secrets.join("\n")}`);
  }
  if (garbage.length > 0) {
    problems.push(`Repository garbage found:\n${garbage.join("\n")}`);
  }
  if (missingIgnoreRules.length > 0) {
    problems.push(
      `Missing protective .gitignore rules:\n${missingIgnoreRules.join("\n")}`,
    );
  }

  if (problems.length > 0) {
    throw new Error(problems.join("\n\n"));
  }

  return `${files.length} repository files inspected; protective ignore rules present`;
}
