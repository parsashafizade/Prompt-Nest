import { ZipArchive } from "archiver";
import { createWriteStream, readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const distDirectory = resolve(projectRoot, "dist");
const packageJson = JSON.parse(readFileSync(resolve(projectRoot, "package.json"), "utf8"));
const version = typeof packageJson.version === "string" ? packageJson.version.trim() : "";

if (!version) throw new Error("package.json must contain a version before packaging.");

const archivePath = resolve(projectRoot, `prompt-nest-${version}.zip`);
const fixedTimestamp = new Date("1980-01-01T00:00:00.000Z");

function distributableFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== "__MACOSX" && !entry.name.startsWith("."))
    .sort((first, second) => first.name.localeCompare(second.name))
    .flatMap((entry) => {
      const absolutePath = join(directory, entry.name);
      if (entry.isDirectory()) return distributableFiles(absolutePath);
      return entry.isFile() ? [absolutePath] : [];
    });
}

function firefoxFileContents(file, archiveName) {
  if (archiveName !== "manifest.json") return readFileSync(file);

  const manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.background && typeof manifest.background === "object") {
    delete manifest.background.service_worker;
  }
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
}

await new Promise((resolveArchive, rejectArchive) => {
  const output = createWriteStream(archivePath);
  const archive = new ZipArchive({
    forceLocalTime: false,
    forceZip64: false,
    zlib: { level: 9 },
  });

  output.on("close", resolveArchive);
  output.on("error", rejectArchive);
  archive.on("error", rejectArchive);
  archive.on("warning", rejectArchive);
  archive.pipe(output);

  for (const file of distributableFiles(distDirectory)) {
    const archiveName = relative(distDirectory, file).split(sep).join("/");
    archive.append(firefoxFileContents(file, archiveName), {
      name: archiveName,
      date: fixedTimestamp,
      mode: 0o644,
    });
  }

  void archive.finalize();
});

console.log(`Created ${relative(projectRoot, archivePath)}`);
