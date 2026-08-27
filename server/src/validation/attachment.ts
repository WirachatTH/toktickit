import fileType from "file-type";

// BR-30/31/33 — fixed attachment rules, enforced server-side regardless of
// what the client already checked.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "application/pdf": ".pdf",
};

export interface AttachmentRejection {
  filename: string;
  reason: string;
  /** Lets the route map to the correct status code (413 vs 415). */
  code: "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE";
}

export interface AttachmentAccepted {
  mimeType: string;
}

// Content is inspected by signature (magic bytes), never trusted from the
// filename extension or the client-declared Content-Type — that's the whole
// point of BR-30 (a spoofed extension must not get through).
//
// Size is checked here, not left to multer's own `limits.fileSize` — that
// limit turned out to reject a file of *exactly* 5 MB (an exclusive
// boundary), while BR-31 requires exactly-5MB to be accepted and only
// 5MB+1 rejected (caught by the boundary test in create-ticket.api.test.ts).
// multer's limit is kept, generously, purely as a DoS safety net; this
// function is the authoritative, precisely-documented boundary.
export async function validateAttachmentBuffer(
  buffer: Buffer,
  originalFilename: string
): Promise<AttachmentAccepted | AttachmentRejection> {
  if (buffer.length > MAX_ATTACHMENT_BYTES) {
    return { filename: originalFilename, reason: "File exceeds the 5 MB limit.", code: "PAYLOAD_TOO_LARGE" };
  }

  let detected: { mime: string } | undefined;
  try {
    detected = await fileType.fromBuffer(buffer);
  } catch {
    // file-type can throw (not just return undefined) on a buffer that
    // matches a signature prefix but is truncated/malformed partway
    // through format-specific parsing (observed directly with a
    // truncated PNG) — a real, unauthenticated file upload from any
    // client can produce exactly this. Treat it as "type could not be
    // verified", the same safe outcome as an undetected type, rather
    // than letting it crash the request.
    detected = undefined;
  }

  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    return {
      filename: originalFilename,
      reason: "Only JPG, JPEG, PNG, WEBP, and PDF files are permitted.",
      code: "UNSUPPORTED_MEDIA_TYPE",
    };
  }

  return { mimeType: detected.mime };
}

export function extensionForMimeType(mimeType: string): string {
  return EXTENSION_BY_MIME[mimeType] ?? "";
}
