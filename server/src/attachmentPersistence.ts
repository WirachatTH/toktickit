import fs from "node:fs/promises";
import type { Prisma } from "@prisma/client";
import { generateStoredFilename, storedFilePath } from "./attachmentStorage.js";

// busboy (multer's multipart parser) decodes filenames from the
// Content-Disposition header as latin1 by default, regardless of what
// bytes the client actually sent, unless the client opts into RFC 2231
// encoding — which most simple multipart clients don't. A non-ASCII
// filename (e.g. Thai) survives the wire as valid UTF-8 bytes but arrives
// here mojibake'd unless re-decoded. Shared so every upload path applies
// the same fix.
export function decodeOriginalFilename(rawName: string): string {
  return Buffer.from(rawName, "latin1").toString("utf8");
}

export interface ValidatedFile {
  buffer: Buffer;
  originalFilename: string;
  mimeType: string;
}

// Shared by the creation-time path (Issue 5) and the add-to-an-existing-
// ticket path (Issue 6) so both write/store an attachment identically — one
// implementation, not duplicated divergent logic (issues.md Issue 6
// "To verify"). `writtenPaths` is the caller's own compensation-tracking
// array; this pushes onto it before the DB insert so a caller whose
// transaction later fails can delete whatever was already written
// (BR-38/BR-39).
export async function persistAttachment(
  tx: Prisma.TransactionClient,
  ticketId: number,
  file: ValidatedFile,
  writtenPaths: string[]
) {
  const storedFilename = generateStoredFilename(file.mimeType);
  await fs.writeFile(storedFilePath(storedFilename), file.buffer);
  writtenPaths.push(storedFilePath(storedFilename));

  return tx.attachment.create({
    data: {
      ticketId,
      originalFilename: file.originalFilename,
      storedFilename,
      mimeType: file.mimeType,
      sizeBytes: file.buffer.length,
    },
  });
}

// Builds a safe Content-Disposition header value for a download response.
// Never interpolates the original filename in unescaped — a filename
// containing a literal `"` or `\` would otherwise break the header's
// quoted-string syntax. Found this is reachable in practice: this app's own
// frontend (fetch/FormData) happens to percent-encode a literal `"` before
// the upload request is even sent, but that's the *client* defending
// itself — a non-browser client (curl, a raw HTTP request) can send an
// unescaped quote straight through busboy's multipart parser. Control
// characters (CR/LF — a header-injection vector) are stripped outright
// rather than escaped, since there's no legitimate reason a filename needs
// one.
export function buildAttachmentContentDisposition(originalFilename: string): string {
  const noControlChars = originalFilename.replace(/[\x00-\x1F\x7F]/g, "");
  const asciiFallback = noControlChars
    .replace(/[^\x20-\x7E]/g, "_")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
  const encoded = encodeURIComponent(noControlChars);
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

export function serializeAttachment(attachment: {
  id: number;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedAt: Date;
  isRemoved: boolean;
  removedAt: Date | null;
  removedReason: string | null;
}) {
  return {
    id: attachment.id,
    originalFilename: attachment.originalFilename,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    uploadedAt: attachment.uploadedAt,
    isRemoved: attachment.isRemoved,
    removedAt: attachment.removedAt,
    removedReason: attachment.removedReason,
  };
}
