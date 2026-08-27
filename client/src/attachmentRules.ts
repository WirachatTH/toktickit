// Client-side pre-check only (BR-29) — the server re-validates by real file
// content and remains the authority. Shared here so Create Ticket (Issue 5)
// and Ticket Detail's attachment section (Issue 8) apply identical rules.

export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
export const MAX_ACTIVE_ATTACHMENTS = 5;

const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

export function checkFileBeforeUpload(file: File): string | null {
  const dot = file.name.lastIndexOf(".");
  const extension = dot === -1 ? "" : file.name.slice(dot).toLowerCase();

  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return "Only JPG, JPEG, PNG, WEBP, and PDF files are permitted.";
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return "File exceeds the 5 MB limit.";
  }
  return null;
}

export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
