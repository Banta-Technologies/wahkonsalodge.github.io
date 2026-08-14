#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { checkLocalPaths } from "./checks/check-local-paths.mjs";
import { checkNoniAndPapa } from "./checks/check-noni-and-papa.mjs";
import { checkPublicAssets } from "./checks/check-public-assets.mjs";

function runCommand(command, argumentsList, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, argumentsList, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stderr = [];

    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          Buffer.concat(stderr).toString("utf8").trim() ||
            `${command} exited with code ${code}`,
        ),
      );
    });
  });
}

async function expectFailure(label, expectedMessage, check) {
  try {
    await check();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes(expectedMessage)) {
      throw new Error(
        `${label} failed for the wrong reason. Expected "${expectedMessage}", received:\n${message}`,
      );
    }

    console.log(`PASS ${label}: rejected as expected`);
    return;
  }

  throw new Error(`${label} was not rejected`);
}

const temporaryRoot = await mkdtemp(
  path.join(os.tmpdir(), "wahkonsa-repo-check-failures-"),
);

try {
  const sourceFixture = path.join(temporaryRoot, "creative-source");
  await mkdir(path.join(sourceFixture, "public"), { recursive: true });
  await writeFile(
    path.join(sourceFixture, "public", "papa-master.kra"),
    "test",
  );
  await expectFailure("public Krita source", "papa-master.kra", () =>
    checkPublicAssets(sourceFixture),
  );

  const backupFixture = path.join(temporaryRoot, "editor-backup");
  await mkdir(path.join(backupFixture, "public"), { recursive: true });
  await writeFile(
    path.join(backupFixture, "public", "comic-final.png~"),
    "test",
  );
  await expectFailure("public editor backup", "comic-final.png~", () =>
    checkPublicAssets(backupFixture),
  );

  const thumbnailFixture = path.join(temporaryRoot, "missing-thumbnail");
  const comicRoot = path.join(
    thumbnailFixture,
    "public",
    "images",
    "noni-and-papa",
  );
  await mkdir(path.join(thumbnailFixture, "src", "data"), { recursive: true });
  await mkdir(path.join(comicRoot, "thumbs"), { recursive: true });
  await writeFile(path.join(comicRoot, "test-comic.png"), "test");
  await writeFile(
    path.join(thumbnailFixture, "src", "data", "noni-and-papa.ts"),
    `export const latestNoniAndPapaSlug = "test-comic";

export const noniAndPapaItems = [
  {
    title: "Test Comic",
    image: "/images/noni-and-papa/test-comic.png",
    thumb: "/images/noni-and-papa/thumbs/test-comic.jpg",
  },
] as const;
`,
  );
  await expectFailure(
    "missing Noni & Papa thumbnail",
    "missing thumbnail",
    () => checkNoniAndPapa(thumbnailFixture),
  );

  const pathFixture = path.join(temporaryRoot, "developer-path");
  await mkdir(path.join(pathFixture, "scripts"), { recursive: true });
  await runCommand("git", ["init", "--quiet"], pathFixture);
  const developerPath = path.posix.join(
    "/",
    "home",
    "exampleuser",
    "artwork",
    "comic.kra",
  );
  await writeFile(
    path.join(pathFixture, "scripts", "path-test.mjs"),
    `export const artworkPath = ${JSON.stringify(developerPath)};\n`,
  );
  await runCommand("git", ["add", "scripts/path-test.mjs"], pathFixture);
  const developerHome = `${path.posix.dirname(
    path.posix.dirname(developerPath),
  )}/`;
  await expectFailure("developer-specific absolute path", developerHome, () =>
    checkLocalPaths(pathFixture),
  );

  console.log("\nAll deliberate repository-check failure tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
