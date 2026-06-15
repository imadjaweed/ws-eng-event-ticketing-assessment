import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { authenticate } from "../middleware/auth.js";

const router = Router();

/**
 * JOIN WAITLIST
 */
router.post("/:eventId/join", authenticate, async (req, res) => {
  try {
    const eventId = req.params.eventId;

    const event = await prisma.event.findUnique({
      where: { id: eventId },
    });

    if (!event) {
      return res.status(404).json({ success: false, message: "Event not found" });
    }

    // check if user already booked
    const existingBooking = await prisma.booking.findFirst({
      where: {
        eventId,
        userId: req.user!.userId,
        status: "CONFIRMED",
      },
    });

    if (existingBooking) {
      return res.status(400).json({
        success: false,
        message: "You already have a ticket",
      });
    }

    // check if already in waitlist
    const existing = await prisma.waitlist.findFirst({
      where: { eventId, userId: req.user!.userId },
    });

    if (existing) {
      return res.json({
        success: true,
        message: "Already in waitlist",
        position: existing.position,
      });
    }

    const count = await prisma.waitlist.count({ where: { eventId } });

    const entry = await prisma.waitlist.create({
      data: {
        eventId,
        userId: req.user!.userId,
        position: count + 1,
      },
    });

    res.json({
      success: true,
      message: "Added to waitlist",
      position: entry.position,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to join waitlist" });
  }
});

/**
 * LEAVE WAITLIST
 */
router.post("/:eventId/leave", authenticate, async (req, res) => {
  try {
    const eventId = req.params.eventId;

    await prisma.waitlist.deleteMany({
      where: {
        eventId,
        userId: req.user!.userId,
      },
    });

    // reorder positions
    const remaining = await prisma.waitlist.findMany({
      where: { eventId },
      orderBy: { position: "asc" },
    });

    for (let i = 0; i < remaining.length; i++) {
      await prisma.waitlist.update({
        where: { id: remaining[i].id },
        data: { position: i + 1 },
      });
    }

    res.json({ success: true, message: "Removed from waitlist" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to leave waitlist" });
  }
});

export default router;
