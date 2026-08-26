import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";
import multer from "multer";
import fs from "fs";
import path from "path";

const router = Router();

// Setup Multer for attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, WEBP, and PDF are allowed."));
    }
  }
});

// Create Ticket
router.post("/", async (req: Request, res: Response) => {
  try {
    const { summary, description, categoryId, systemId, priority, requesterId } = req.body;

    if (!summary || summary.length > 120) {
      return res.status(400).json({ error: "Summary is required and must be <= 120 characters." });
    }
    if (!description || description.length > 1000) {
      return res.status(400).json({ error: "Description is required and must be <= 1000 characters." });
    }
    if (!categoryId || !systemId || !priority || !requesterId) {
      return res.status(400).json({ error: "Missing required fields." });
    }

    // Verify category, system, requester exist
    const category = await getPrisma().category.findUnique({ where: { id: Number(categoryId) } });
    const system = await getPrisma().relatedSystem.findUnique({ where: { id: Number(systemId) } });
    const requester = await getPrisma().requesterUser.findUnique({ where: { id: Number(requesterId) } });

    if (!category || !system || !requester) {
      return res.status(400).json({ error: "Invalid category, system, or requester." });
    }

    // Verify priority
    const validPriorities = ["LOW", "MEDIUM", "HIGH", "URGENT"];
    if (!validPriorities.includes(priority)) {
      return res.status(400).json({ error: "Invalid priority." });
    }

    // Use a transaction to safely assign ticketNumber based on the autoincremented ID
    const newTicket = await getPrisma().$transaction(async (tx) => {
      const tempId = Date.now().toString() + Math.random().toString();
      const ticket = await tx.ticket.create({
        data: {
          ticketNumber: `TEMP-${tempId}`,
          summary,
          description,
          categoryId: Number(categoryId),
          systemId: Number(systemId),
          priority,
          requesterId: Number(requesterId),
          status: "NEW"
        }
      });
      return tx.ticket.update({
        where: { id: ticket.id },
        data: { ticketNumber: `TICK-${1000 + ticket.id}` }
      });
    });

    res.status(201).json(newTicket);
  } catch (error) {
    console.error("Error creating ticket:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// Upload Attachment
router.post("/:id/attachments", (req: Request, res: Response) => {
  upload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ error: err.message });
    }
    
    try {
      const ticketId = Number(req.params.id);
      
      const ticket = await getPrisma().ticket.findUnique({ where: { id: ticketId } });
      if (!ticket) {
        return res.status(404).json({ error: "Ticket not found." });
      }

      const activeAttachments = await getPrisma().attachment.count({
        where: { ticketId, isDeleted: false }
      });

      if (activeAttachments >= 5) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({ error: "Maximum of 5 attachments allowed per ticket." });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No file uploaded." });
      }

      const attachment = await getPrisma().attachment.create({
        data: {
          ticketId,
          filename: req.file.originalname,
          path: req.file.path,
          size: req.file.size,
          mimeType: req.file.mimetype
        }
      });

      res.status(201).json(attachment);
    } catch (error) {
      console.error("Error uploading attachment:", error);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });
});

export default router;
