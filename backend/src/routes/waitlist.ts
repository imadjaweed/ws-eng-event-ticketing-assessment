import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

/**
 * JOIN WAITLIST
 */
router.post("/:eventId", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // check if already booked
    const existingBooking = await prisma.booking.findFirst({
      where: {
        eventId,
        userId: req.user!.userId,
      },
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "You already have a ticket or are already in system",
      });
    }

    // check if already in waitlist
    const existing = await prisma.waitlist.findFirst({
      where: {
        eventId,
        userId: req.user!.userId,
      },
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        message: "Already in waitlist",
      });
    }

    const entry = await prisma.waitlist.create({
      data: {
        eventId,
        userId: req.user!.userId,
      },
    });

    const position = await prisma.waitlist.count({
      where: {
        eventId,
        createdAt: { lte: entry.createdAt },
      },
    });

    res.json({
      success: true,
      message: "Added to waitlist",
      data: { position },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({
      success: false,
      message: "Failed to join waitlist",
    });
  }
});

/**
 * GET POSITION
 */
router.get("/:eventId/position", authenticate, async (req, res) => {
  try {
    const { eventId } = req.params;

    const entry = await prisma.waitlist.findFirst({
      where: {
        eventId,
        userId: req.user!.userId,
      },
    });

    if (!entry) {
      return res.status(404).json({
        success: false,
        message: "Not in waitlist",
      });
    }

    const position = await prisma.waitlist.count({
      where: {
        eventId,
        createdAt: { lte: entry.createdAt },
      },
    });

    res.json({
      success: true,
      data: { position },
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to get position",
    });
  }
});

/**
 * LEAVE WAITLIST
 */
router.delete("/:eventId", authenticate, async (req, res) => {
  try {
    await prisma.waitlist.deleteMany({
      where: {
        eventId: req.params.eventId,
        userId: req.user!.userId,
      },
    });

    res.json({
      success: true,
      message: "Removed from waitlist",
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: "Failed to leave waitlist",
    });
  }
});

export default router;
