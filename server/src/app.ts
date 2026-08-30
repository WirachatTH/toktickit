import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import { getPrisma } from "./prisma.js";
import { formatTicketNumber } from "./ticketNumber.js";
import { validateTicketFields } from "./validation/ticket.js";
import { validateAttachmentBuffer, MAX_ACTIVE_ATTACHMENTS, MAX_ATTACHMENT_BYTES } from "./validation/attachment.js";
import { ensureUploadDir, storedFilePath } from "./attachmentStorage.js";
import {
  decodeOriginalFilename,
  persistAttachment,
  serializeAttachment,
  buildAttachmentContentDisposition,
} from "./attachmentPersistence.js";
import { authenticateRequester } from "./requesterAuth.js";

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

    const prisma = getPrisma();

    try {
      const auth = await authenticateRequester(prisma, req);
      if (!auth) {
        return res
          .status(401)
          .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
      }
      const { requesterId } = auth;

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
        const originalFilename = decodeOriginalFilename(file.originalname);
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
            // persistAttachment writes to disk and pushes onto writtenPaths
            // before the DB insert, so a failure here throws, rolling back
            // the whole Postgres transaction — the outer catch below then
            // compensates by deleting whatever was already written (the
            // file bytes themselves are NOT part of that DB transaction).
            await persistAttachment(tx, created.id, file, writtenPaths);
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

// ---------------------------------------------------------------------------
// Lab 2, Issue 6 — post-creation attachment lifecycle: add a file to an
// existing Ticket, retrieve metadata, download, soft-remove. See
// docs/lab-02/api-spec.md §7-10. Every route here requires ownership: a
// Ticket not owned by the current Requester is indistinguishable from a
// nonexistent one (404, Decision D-2) — whether the mismatch is because the
// Ticket doesn't exist, belongs to someone else, or the Attachment named in
// the URL doesn't belong to that Ticket.
// ---------------------------------------------------------------------------

const TICKET_NOT_FOUND = { error: { code: "NOT_FOUND", message: "Ticket not found." } };
const ATTACHMENT_NOT_FOUND = { error: { code: "NOT_FOUND", message: "Attachment not found." } };

class AttachmentLimitError extends Error {}
class AlreadyRemovedError extends Error {}

// Postgres's id columns are Int32. `Number.isFinite(9999999999)` is true —
// it's a perfectly ordinary finite JS number, just outside Int32 range —
// so that check alone lets an oversized id reach Prisma, which throws on
// the conversion and falls into the generic catch as a 500. A malformed-
// looking id (this one included) must be a safe 404 instead, the same as
// a non-numeric one already is (tests.md API-21).
function isValidId(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && value <= 2147483647;
}

async function findOwnedTicket(prisma: PrismaClient, ticketId: number, requesterId: number) {
  if (!isValidId(ticketId)) return null;
  return prisma.ticket.findFirst({ where: { id: ticketId, requesterId } });
}

app.post("/api/tickets/:id/attachments", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (uploadError: unknown) => {
    if (uploadError) {
      // Mirrors the create-ticket route's MulterError handling exactly —
      // this had drifted to only handling LIMIT_FILE_SIZE, so a wrong field
      // name or extra file (LIMIT_UNEXPECTED_FILE) fell through to the
      // generic 500 instead of the 400 the other route already gives it.
      if (uploadError instanceof multer.MulterError) {
        if (uploadError.code === "LIMIT_FILE_SIZE") {
          return res
            .status(413)
            .json({ error: { code: "PAYLOAD_TOO_LARGE", message: "The attachment exceeds the 5 MB limit." } });
        }
        return res.status(400).json({
          error: { code: "VALIDATION_ERROR", message: "The attachment could not be uploaded." },
        });
      }
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    }

    const prisma = getPrisma();
    try {
      const auth = await authenticateRequester(prisma, req);
      if (!auth) {
        return res
          .status(401)
          .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
      }

      const ticketId = Number(req.params.id);
      const ticket = await findOwnedTicket(prisma, ticketId, auth.requesterId);
      if (!ticket) {
        return res.status(404).json(TICKET_NOT_FOUND);
      }

      const file = req.file as Express.Multer.File | undefined;
      if (!file) {
        return res
          .status(400)
          .json({ error: { code: "VALIDATION_ERROR", message: "No file was included in the request." } });
      }

      const originalFilename = decodeOriginalFilename(file.originalname);
      const result = await validateAttachmentBuffer(file.buffer, originalFilename);
      if ("reason" in result) {
        const status = result.code === "PAYLOAD_TOO_LARGE" ? 413 : 415;
        return res.status(status).json({
          error: { code: result.code, message: `"${originalFilename}": ${result.reason}` },
        });
      }

      const writtenPaths: string[] = [];
      try {
        const attachment = await prisma.$transaction(async (tx) => {
          // Locks the Ticket row so two concurrent add-attachment requests
          // for the same Ticket serialize instead of both reading the same
          // active count and both proceeding past the limit (BR-32 race
          // safety). Issue 5's creation-time path gets this for free since
          // all of one Ticket's initial files arrive in a single request;
          // here each add is an independent request, so it needs its own
          // lock.
          await tx.$queryRaw`SELECT id FROM "Ticket" WHERE id = ${ticketId} FOR UPDATE`;

          const activeCount = await tx.attachment.count({ where: { ticketId, isRemoved: false } });
          if (activeCount >= MAX_ACTIVE_ATTACHMENTS) {
            throw new AttachmentLimitError();
          }

          return persistAttachment(
            tx,
            ticketId,
            { buffer: file.buffer, originalFilename, mimeType: result.mimeType },
            writtenPaths
          );
        });

        return res.status(201).json(serializeAttachment(attachment));
      } catch (transactionError) {
        await Promise.all(writtenPaths.map((p) => fs.unlink(p).catch(() => {})));
        if (transactionError instanceof AttachmentLimitError) {
          return res
            .status(409)
            .json({ error: { code: "CONFLICT", message: "This Ticket already has 5 active attachments." } });
        }
        return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
      }
    } catch (error) {
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    }
  });
});

app.get("/api/tickets/:ticketId/attachments/:attachmentId", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const auth = await authenticateRequester(prisma, req);
    if (!auth) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const ticketId = Number(req.params.ticketId);
    const ticket = await findOwnedTicket(prisma, ticketId, auth.requesterId);
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const attachmentId = Number(req.params.attachmentId);
    if (!isValidId(attachmentId)) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
    if (!attachment) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    return res.status(200).json(serializeAttachment(attachment));
  } catch (error) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});

app.get("/api/tickets/:ticketId/attachments/:attachmentId/download", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const auth = await authenticateRequester(prisma, req);
    if (!auth) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const ticketId = Number(req.params.ticketId);
    const ticket = await findOwnedTicket(prisma, ticketId, auth.requesterId);
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const attachmentId = Number(req.params.attachmentId);
    if (!isValidId(attachmentId)) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
    // Removed and "not yours" are made indistinguishable on purpose
    // (Decision D-2, BR-37) — both are simply "not found" from the outside.
    if (!attachment || attachment.isRemoved) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    let fileBuffer: Buffer;
    try {
      fileBuffer = await fs.readFile(storedFilePath(attachment.storedFilename));
    } catch {
      // The DB row exists but the file is missing on disk — shouldn't
      // normally happen (nothing in Lab 2 deletes files independently of
      // the row), but fail safely instead of crashing if it ever does.
      return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
    }

    res.setHeader("Content-Type", attachment.mimeType);
    res.setHeader("Content-Disposition", buildAttachmentContentDisposition(attachment.originalFilename));
    return res.status(200).send(fileBuffer);
  } catch (error) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});

app.patch("/api/tickets/:ticketId/attachments/:attachmentId/remove", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const auth = await authenticateRequester(prisma, req);
    if (!auth) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const ticketId = Number(req.params.ticketId);
    const ticket = await findOwnedTicket(prisma, ticketId, auth.requesterId);
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    const attachmentId = Number(req.params.attachmentId);
    if (!isValidId(attachmentId)) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    const attachment = await prisma.attachment.findFirst({ where: { id: attachmentId, ticketId } });
    if (!attachment) return res.status(404).json(ATTACHMENT_NOT_FOUND);

    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 3 || reason.length > 200) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "A removal reason of 3-200 characters is required." },
      });
    }

    try {
      const updated = await prisma.$transaction(async (tx) => {
        // Locks this Attachment row so two concurrent removal requests can't
        // both read isRemoved=false and both "win" the update — that race
        // let the second commit silently overwrite the first request's
        // removedReason/removedAt. A quick manual test won't surface it:
        // sequential traffic finishes the first request before the second
        // one starts, so the window only opens under genuine concurrency.
        const [locked] = await tx.$queryRaw<{ isRemoved: boolean }[]>`
          SELECT "isRemoved" FROM "Attachment" WHERE id = ${attachment.id} FOR UPDATE
        `;
        if (!locked || locked.isRemoved) {
          throw new AlreadyRemovedError();
        }

        return tx.attachment.update({
          where: { id: attachment.id },
          data: { isRemoved: true, removedAt: new Date(), removedReason: reason },
        });
      });

      return res.status(200).json({
        id: updated.id,
        isRemoved: updated.isRemoved,
        removedAt: updated.removedAt,
        removedReason: updated.removedReason,
      });
    } catch (transactionError) {
      if (transactionError instanceof AlreadyRemovedError) {
        return res
          .status(409)
          .json({ error: { code: "CONFLICT", message: "This attachment has already been removed." } });
      }
      throw transactionError;
    }
  } catch (error) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});
// ---------------------------------------------------------------------------

export default app;
