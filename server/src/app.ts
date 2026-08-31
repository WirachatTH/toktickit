import express, { Request, Response } from "express";
import cors from "cors";
import multer from "multer";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import type { PrismaClient, Prisma } from "@prisma/client";
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
// Lab 2, Issue 7 — GET /api/tickets. See docs/lab-02/api-spec.md §5 and
// specification.md BR-12, BR-14-19, Decision D-5: this is a list endpoint,
// so an invalid/out-of-range query parameter is clamped to the nearest safe
// default rather than ever producing a 400 — only a missing/invalid
// requester identity does.
// ---------------------------------------------------------------------------

type TicketSortField = "createdAt" | "updatedAt" | "ticketNumber" | "summary" | "requestedPriority";
const SORTABLE_FIELDS: readonly TicketSortField[] = [
  "createdAt",
  "updatedAt",
  "ticketNumber",
  "summary",
  "requestedPriority",
];
const PRIORITY_VALUES = new Set(["LOW", "MEDIUM", "HIGH"]);

// A page number this high is already meaningless (nobody pages through a
// million pages of tickets), but the real reason for the cap is safety, not
// UX: without it, a "valid-looking" huge page (e.g. from a stale/hand-edited
// URL) survives Number.isInteger — it's an ordinary finite integer, just an
// enormous one — and `(page - 1) * pageSize` then overflows Number's safe
// integer range before it ever reaches Prisma, which throws converting it
// to a query parameter. That surfaced as a real 500 (found by probing the
// running server with an absurd page value), directly violating BR-19's
// "a list endpoint always returns a best-effort valid page, never an error."
const MAX_PAGE = 1_000_000;

function parsePage(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < 1) return 1;
  return Math.min(n, MAX_PAGE);
}

function parsePageSize(raw: unknown): number {
  // `?pageSize=` (present but empty) must default the same way an absent
  // pageSize does. Number("") is 0, not NaN — a genuine JS gotcha — so
  // without this explicit check it slipped past Number.isInteger and
  // clamped to 1 instead of falling back to the documented default of 10.
  if (raw === undefined || raw === "") return 10;
  const n = Number(raw);
  if (!Number.isInteger(n)) return 10;
  return Math.min(Math.max(n, 1), 50);
}

function parseSortField(raw: unknown): TicketSortField {
  return typeof raw === "string" && (SORTABLE_FIELDS as string[]).includes(raw) ? (raw as TicketSortField) : "createdAt";
}

function parseOrder(raw: unknown): "asc" | "desc" {
  return raw === "asc" ? "asc" : "desc";
}

// Same class of bug as parsePage/authenticateRequester's id parsing, found
// by a peer reviewer within minutes of probing this route: Number.isInteger
// alone accepts a value like 9999999999 (an ordinary finite integer, just
// outside Int32 range), which reaches Prisma and throws converting it,
// surfacing as a 500 instead of the "filter silently ignored" behavior
// every other invalid categoryId/relatedSystemId already gets.
function parsePositiveId(raw: unknown): number | undefined {
  const n = Number(raw);
  return Number.isSafeInteger(n) && n > 0 && n <= 2147483647 ? n : undefined;
}

// Prisma's `contains`/`startsWith` compile to a Postgres LIKE, parameterized
// against SQL injection but NOT against LIKE's own wildcard syntax — `%`
// and `_` inside the parameter value are still live wildcards to Postgres,
// and backslash is the default LIKE escape character. Found by probing a
// literal search: a ticket summary containing "50%" also (wrongly) matched
// "50 items delivered" once "50%" was searched, because the unescaped "%"
// matched anything after "50". BR-14 promises a literal substring match, so
// a Requester's own `%`/`_`/`\` must be neutralized before it reaches LIKE.
function escapeLikePattern(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

app.get("/api/tickets", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const auth = await authenticateRequester(prisma, req);
    if (!auth) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const page = parsePage(req.query.page);
    const pageSize = parsePageSize(req.query.pageSize);
    const sortField = parseSortField(req.query.sort);
    const order = parseOrder(req.query.order);

    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const categoryId = parsePositiveId(req.query.categoryId);
    const relatedSystemId = parsePositiveId(req.query.relatedSystemId);
    const requestedPriority =
      typeof req.query.requestedPriority === "string" && PRIORITY_VALUES.has(req.query.requestedPriority)
        ? (req.query.requestedPriority as Prisma.TicketWhereInput["requestedPriority"])
        : undefined;

    // BR-12 — always scoped to the caller's own identity; no query parameter
    // can widen this (API-11). Prisma's fluent filters are parameterized by
    // construction, so a SQL-meaningful search string (API-17) is safe too.
    const where: Prisma.TicketWhereInput = {
      requesterId: auth.requesterId,
      ...(search
        ? {
            OR: [
              { ticketNumber: { startsWith: escapeLikePattern(search), mode: "insensitive" } },
              { summary: { contains: escapeLikePattern(search), mode: "insensitive" } },
            ],
          }
        : {}),
      ...(categoryId !== undefined ? { categoryId } : {}),
      ...(relatedSystemId !== undefined ? { relatedSystemId } : {}),
      ...(requestedPriority !== undefined ? { requestedPriority } : {}),
    };

    // BR-17 — id desc is a stable secondary tiebreaker so equal-value rows
    // (e.g. same createdAt) don't reorder unpredictably between pages.
    const orderBy: Prisma.TicketOrderByWithRelationInput[] = [
      { [sortField]: order } as Prisma.TicketOrderByWithRelationInput,
      { id: "desc" },
    ];

    const [tickets, totalItems] = await Promise.all([
      prisma.ticket.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          category: { select: { name: true } },
          relatedSystem: { select: { name: true } },
          _count: { select: { attachments: { where: { isRemoved: false } } } },
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    return res.status(200).json({
      data: tickets.map((t) => ({
        id: t.id,
        ticketNumber: t.ticketNumber,
        summary: t.summary,
        categoryName: t.category.name,
        relatedSystemName: t.relatedSystem.name,
        requestedPriority: t.requestedPriority,
        currentStatus: t.currentStatus,
        attachmentCount: t._count.attachments,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      })),
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages: Math.ceil(totalItems / pageSize),
      },
    });
  } catch (error) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
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

// ---------------------------------------------------------------------------
// Lab 2, Issue 8 — GET /api/tickets/:id. See docs/lab-02/api-spec.md §6 and
// specification.md BR-45: a Ticket not owned by the current Requester is
// indistinguishable from a nonexistent one (404, Decision D-2) — the same
// ownership rule the Issue 6 attachment routes above already enforce.
// ---------------------------------------------------------------------------
app.get("/api/tickets/:id", async (req: Request, res: Response) => {
  const prisma = getPrisma();
  try {
    const auth = await authenticateRequester(prisma, req);
    if (!auth) {
      return res
        .status(401)
        .json({ error: { code: "UNAUTHENTICATED", message: "A Development Requester must be selected." } });
    }

    const ticketId = Number(req.params.id);
    if (!isValidId(ticketId)) return res.status(404).json(TICKET_NOT_FOUND);

    const ticket = await prisma.ticket.findFirst({
      where: { id: ticketId, requesterId: auth.requesterId },
      include: {
        requester: { select: { id: true, name: true, email: true } },
        category: { select: { id: true, name: true } },
        relatedSystem: { select: { id: true, name: true } },
        // id asc is a stable secondary tiebreaker, same reasoning as the
        // Issue 7 ticket list's own tiebreak (BR-17): two attachments
        // landing on the same uploadedAt millisecond would otherwise have
        // no defined relative order. Kept even though a mutation test
        // couldn't prove it changes anything at this table's scale — for
        // freshly-inserted rows, id-asc and Postgres's own incidental scan
        // order are indistinguishable, since ids are assigned in the same
        // order rows are inserted. Correct on the merits regardless: an
        // ORDER BY with no fully-determining key has no defined tie order
        // at all per the SQL standard, whatever a given query happens to
        // return today.
        attachments: { orderBy: [{ uploadedAt: "asc" }, { id: "asc" }] },
      },
    });
    if (!ticket) return res.status(404).json(TICKET_NOT_FOUND);

    return res.status(200).json({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      requester: ticket.requester,
      category: ticket.category,
      relatedSystem: ticket.relatedSystem,
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
        removedAt: a.removedAt,
        removedReason: a.removedReason,
      })),
    });
  } catch (error) {
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." } });
  }
});
// ---------------------------------------------------------------------------

export default app;
