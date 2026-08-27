import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { getPrisma } from "./prisma.js";
import { formatTicketNumber } from "./ticketNumber.js";
import { validateTicketFields } from "./validation/ticket.js";
import { validateAttachmentBuffer, MAX_ACTIVE_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./validation/attachment.js";
import { ensureUploadDir, generateStoredFilename, storedFilePath } from "./attachmentStorage.js";

// The Express app is exported separately from app.listen() (see index.ts) so
// Supertest can import `app` without opening a port. Do not merge these files.
export const app = express();

app.use(cors());          // already wired: lets the Vite dev server call this API
app.use(express.json());

await ensureUploadDir();
const upload = multer({
  storage: multer.memoryStorage(),
  // fileSize is a generous DoS safety net only, not the authoritative 5 MB
  // rule — multer's own limit rejects a file of exactly the configured size
  // (an exclusive boundary), which would incorrectly reject a genuinely
  // exactly-5MB attachment. validateAttachmentBuffer is the precise,
  // documented boundary check (BR-31).
  limits: { fileSize: MAX_ATTACHMENT_BYTES * 2, files: MAX_ACTIVE_ATTACHMENTS },
});

// ---------------------------------------------------------------------------
// Issue 2 — API health check
// Make the test in tests/lab-01/health.test.ts pass.
// It must return HTTP 200 with JSON: { status: "ok", service: "TokTickIT API" }
// ---------------------------------------------------------------------------
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok", service: "TokTickIT API" });
});

// ---------------------------------------------------------------------------
// Issue 4 — Category list
// Add:  GET /api/categories
//   -> read categories from PostgreSQL via getPrisma().category.findMany(...)
//   -> return each { id, name } in a predictable (id) order
//   -> on failure, respond 500 with a safe message (no internal details)
app.get("/api/categories", async (_req: Request, res: Response) => {
  try {
    const categories = await getPrisma().category.findMany({
      select: { id: true, name: true },
      orderBy: { id: 'asc' }
    });
    res.status(200).json(categories);
  } catch (error) {
    // Matches the §0 error envelope every Lab 2 reference-data endpoint
    // uses (this route is also part of that contract — api-spec.md §1),
    // even though it was implemented in Lab 1 before that envelope existed.
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lab 2, Issue 4 — reference-data endpoints backing the Development
// Requester Selector and (later) Create Ticket. See docs/lab-02/api-spec.md
// §2-3. Neither route requires the X-Dev-Requester-Id header — a Requester
// hasn't been chosen yet when the Selector loads these.
// ---------------------------------------------------------------------------
app.get("/api/systems", async (_req: Request, res: Response) => {
  try {
    const systems = await getPrisma().relatedSystem.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(systems);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});

app.get("/api/requesters", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
    res.status(200).json(requesters);
  } catch (error) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Lab 2, Issue 5 — POST /api/tickets. See docs/lab-02/api-spec.md §4 and
// specification.md BR-38: the Ticket and any attachments submitted with it
// are one atomic operation — validation fails before any file is written or
// row inserted, and a mid-creation storage failure rolls the whole thing
// back (no orphaned Ticket, Attachment row, or file left on disk).
// ---------------------------------------------------------------------------

function serializeTicket(ticket: {
  id: number;
  ticketNumber: string;
  requesterId: number;
  categoryId: number;
  relatedSystemId: number;
  summary: string;
  description: string;
  requestedPriority: string;
  currentStatus: string;
  createdAt: Date;
  updatedAt: Date;
  attachments: {
    id: number;
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    uploadedAt: Date;
    isRemoved: boolean;
  }[];
}) {
  return {
    id: ticket.id,
    ticketNumber: ticket.ticketNumber,
    requesterId: ticket.requesterId,
    categoryId: ticket.categoryId,
    relatedSystemId: ticket.relatedSystemId,
    summary: ticket.summary,
    description: ticket.description,
    requestedPriority: ticket.requestedPriority,
    currentStatus: ticket.currentStatus,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
    attachments: ticket.attachments.map((a) => ({
      id: a.id,
      originalFilename: a.originalFilename,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      uploadedAt: a.uploadedAt,
      isRemoved: a.isRemoved,
    })),
  };
}

app.post("/api/tickets", (req: Request, res: Response) => {
  upload.array("attachments", MAX_ACTIVE_ATTACHMENTS)(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      if (uploadError instanceof multer.MulterError) {
        if (uploadError.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "An attachment exceeds the 5 MB limit." } });
        }
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "A Ticket may have at most 5 attachments." },
        });
      }
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    }

    const requesterId = Number(req.header("X-Dev-Requester-Id"));
    if (!req.header("X-Dev-Requester-Id") || !Number.isFinite(requesterId)) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const prisma = getPrisma();

    try {
      const requester = await prisma.requesterUser.findUnique({ where: { id: requesterId } });
      if (!requester || !requester.isActive) {
        return res
          .status(401)
          .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
      }

      const { fields, errors } = validateTicketFields(req.body);
      if (errors) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Some fields need attention before this ticket can be created.", fields: errors },
        });
      }

      const [category, relatedSystem] = await Promise.all([
        prisma.category.findUnique({ where: { id: fields.categoryId } }),
        prisma.relatedSystem.findUnique({ where: { id: fields.relatedSystemId } }),
      ]);
      if (!category) {
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "Category not found.", fields: { categoryId: "Category not found." } },
        });
      }
      if (!relatedSystem || !relatedSystem.isActive) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Related System not found or no longer active.",
            fields: { relatedSystemId: "Related System not found or no longer active." },
          },
        });
      }

      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const validatedFiles: { buffer: Buffer; originalFilename: string; mimeType: string }[] = [];
      for (const file of files) {
        // busboy (multer's multipart parser) decodes the filename from the
        // Content-Disposition header as latin1 by default, regardless of
        // what bytes the client actually sent, unless the client opts into
        // RFC 2231 encoding — which most simple multipart clients don't.
        // A non-ASCII filename (e.g. Thai) survives the wire as valid UTF-8
        // bytes but arrives here mojibake'd unless re-decoded. This is a
        // well-documented multer/busboy behavior, not a bug in the upload
        // itself — round-tripping through latin1 -> utf8 recovers it.
        const originalFilename = Buffer.from(file.originalname, "latin1").toString("utf8");
        const result = await validateAttachmentBuffer(file.buffer, originalFilename);
        if ("reason" in result) {
          const status = result.code === "PAYLOAD_TOO_LARGE" ? 413 : 415;
          return res.status(status).json({
            error: { code: result.code, message: `"${originalFilename}": ${result.reason}` },
          });
        }
        validatedFiles.push({ buffer: file.buffer, originalFilename, mimeType: result.mimeType });
      }

      const writtenPaths: string[] = [];
      try {
        const ticket = await prisma.$transaction(async (tx) => {
          const created = await tx.ticket.create({
            data: {
              requesterId,
              categoryId: fields.categoryId,
              relatedSystemId: fields.relatedSystemId,
              summary: fields.summary,
              description: fields.description,
              requestedPriority: fields.requestedPriority,
              // Placeholder, replaced below once the real id exists — a
              // Ticket Number can't be computed before the row is inserted,
              // but both statements commit together (BR-01).
              ticketNumber: `PENDING-${randomUUID()}`,
            },
          });

          await tx.ticket.update({
            where: { id: created.id },
            data: { ticketNumber: formatTicketNumber(created.id) },
          });

          for (const file of validatedFiles) {
            const storedFilename = generateStoredFilename(file.mimeType);
            // Written inside the try so a failure here throws, rolling back
            // the whole Postgres transaction — but the bytes on disk are
            // NOT part of that transaction, so the outer catch below
            // compensates by deleting whatever was already written.
            await fs.writeFile(storedFilePath(storedFilename), file.buffer);
            writtenPaths.push(storedFilePath(storedFilename));

            await tx.attachment.create({
              data: {
                ticketId: created.id,
                originalFilename: file.originalFilename,
                storedFilename,
                mimeType: file.mimeType,
                sizeBytes: file.buffer.length,
              },
            });
          }

          return tx.ticket.findUniqueOrThrow({
            where: { id: created.id },
            include: { attachments: true },
          });
        });

        return res.status(201).json(serializeTicket(ticket));
      } catch (transactionError) {
        await Promise.all(writtenPaths.map((p) => fs.unlink(p).catch(() => {})));
        return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
      }
    } catch (error) {
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    }
  });
});
// ---------------------------------------------------------------------------

export default app;
