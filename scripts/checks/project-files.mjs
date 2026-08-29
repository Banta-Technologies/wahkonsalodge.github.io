import { access } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

export async function listProjectFiles(repositoryRoot) {
  const files = await new Promise((resolve, reject) => {
    const child = spawn(
      "git",
      ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
      {
        cwd: repositoryRoot,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.once("error", (error) => {
      reject(new Error(`Unable to inspect repository files: ${error.message}`));
    });
    child.once("exit", (code) => {
      if (code !== 0) {
        const detail = Buffer.concat(stderr).toString("utf8").trim();
        reject(
          new Error(
            `Unable to inspect repository files: ${detail || "git ls-files failed"}`,
          ),
        );
        return;
      }

      resolve(
        Buffer.concat(stdout)
          .toString("utf8")
          .split("\0")
          .filter(Boolean)
          .sort(),
      );
    });
  });

  const existingFiles = await Promise.all(
    files.map(async (filename) => {
      try {
        await access(path.join(repositoryRoot, filename));
        return filename;
      } catch {
        return undefined;
      }
    }),
  );

  return existingFiles.filter(Boolean);
}
