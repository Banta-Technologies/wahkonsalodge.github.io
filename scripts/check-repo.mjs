#!/usr/bin/env node

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkLocalPaths } from "./checks/check-local-paths.mjs";
import { checkNoniAndPapa } from "./checks/check-noni-and-papa.mjs";
import { checkPublicAssets } from "./checks/check-public-assets.mjs";
import { checkRepositoryHygiene } from "./checks/check-repository-hygiene.mjs";
import { listProjectFiles } from "./checks/project-files.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function runCommand(command, argumentsList) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd: repositoryRoot,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      const ending = signal ? `signal ${signal}` : `exit code ${code}`;
      reject(new Error(`Command failed with ${ending}`));
    });
  });
}

async function checkNodeScriptSyntax() {
  const scripts = (await listProjectFiles(repositoryRoot)).filter(
    (filename) =>
      (filename.startsWith("scripts/") || filename.startsWith("serverless/")) &&
      [".cjs", ".js", ".mjs"].includes(path.extname(filename)),
  );

  for (const script of scripts) {
    await runCommand(process.execPath, ["--check", script]);
  }

  return `${scripts.length} Node scripts checked`;
}

const checks = [
  {
    name: "Public asset hygiene",
    run: () => checkPublicAssets(repositoryRoot),
  },
  {
    name: "Noni & Papa website assets",
    run: () => checkNoniAndPapa(repositoryRoot),
  },
  {
    name: "Developer-specific paths",
    run: () => checkLocalPaths(repositoryRoot),
  },
  {
    name: "Secrets and repository garbage",
    run: () => checkRepositoryHygiene(repositoryRoot),
  },
  {
    name: "Node script syntax",
    run: checkNodeScriptSyntax,
  },
  {
    name: "Formatting",
    run: async () => {
      await runCommand(pnpmCommand, ["exec", "prettier", "--check", "."]);
      return "Prettier validation passed";
    },
  },
  {
    name: "Astro and TypeScript",
    run: async () => {
      await runCommand(pnpmCommand, ["exec", "astro", "check"]);
      return "Astro diagnostics passed";
    },
  },
  {
    name: "Changed-file whitespace",
    run: async () => {
      await runCommand("git", ["diff", "--check", "HEAD", "--"]);
      return "No whitespace errors in local changes";
    },
  },
  {
    name: "Production build",
    run: async () => {
      await runCommand(pnpmCommand, ["build"]);
      return "Astro production build passed";
    },
  },
];

const results = [];

for (const check of checks) {
  console.log(`\n--- ${check.name} ---`);
  try {
    const detail = await check.run();
    results.push({ name: check.name, passed: true, detail });
    console.log(`PASS ${check.name}: ${detail}`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name: check.name, passed: false, detail });
    console.error(`FAIL ${check.name}\n\n${detail}`);
  }
}

console.log("\nRepository check summary");
for (const result of results) {
  console.log(`${result.passed ? "PASS" : "FAIL"} ${result.name}`);
}

const failures = results.filter((result) => !result.passed);
if (failures.length > 0) {
  console.error(
    `\nRepository check failed: ${failures.length} check(s) failed.`,
  );
  process.exitCode = 1;
} else {
  console.log(`\nRepository check passed: ${results.length} checks passed.`);
}
