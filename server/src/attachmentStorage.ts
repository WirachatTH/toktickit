import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { extensionForMimeType } from "./validation/attachment.js";

// BR-33 — generated, collision-proof, path-traversal-safe on-disk name,
// unrelated to the original filename on purpose. The original is kept only
// as display metadata (Attachment.originalFilename).
export const UPLOAD_DIR = path.resolve(process.cwd(), "uploads");

export async function ensureUploadDir(): Promise<void> {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export function generateStoredFilename(mimeType: string): string {
  return `${randomUUID()}${extensionForMimeType(mimeType)}`;
}

export function storedFilePath(storedFilename: string): string {
  return path.join(UPLOAD_DIR, storedFilename);
}
