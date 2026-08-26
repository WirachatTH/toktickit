import { Router, Request, Response } from "express";
import { getPrisma } from "../prisma.js";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  try {
    const requesters = await getPrisma().requesterUser.findMany({
      where: { isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { id: "asc" },
    });
    res.status(200).json(requesters);
  } catch (error) {
    console.error("Database error in /api/requesters:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

export default router;
