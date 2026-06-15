import { transferBooking } from "../lib/transfer.js";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { createBookingSchema } from "../lib/validations.js";
import { authenticate } from "../middleware/auth.js";
import { generateTicketCode, generateQRData, generateQRCodeDataURL } from "../lib/qr.js";
import { calculateRefund } from "../lib/refund.js";
import { incrementCapacity, decrementCapacity } from "../lib/capacity.js";

// Booking ownership changes: see lib/transfer.ts for the cancel+create utility
// used by organizer reassignment. For attendee-initiated transfers, consider
// whether the full cancel+create cycle is needed or if a simpler ownership
// update would suffice — see the NOTE in transfer.ts for trade-offs.

const router = Router();

// GET /api/bookings - List user's bookings
router.get("/", authenticate, async (req, res) => {
  try {
    const bookings = await prisma.booking.findMany({
      where: {
        userId: req.user!.userId,
      },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            time: true,
            venue: true,
            imageUrl: true,
            status: true,
            category: true,
          },
        },
        seatTier: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    res.json({ success: true, data: bookings });
  } catch (error) {
    console.error("Error fetching bookings:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch bookings",
    });
  }
});

// GET /api/bookings/:id - Get booking details
router.get("/:id", authenticate, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            time: true,
            venue: true,
            imageUrl: true,
            artistInfo: true,
            status: true,
            category: true,
            refundPolicy: true,
            serviceFeePercent: true,
          },
        },
        seatTier: {
          select: {
            id: true,
            name: true,
            price: true,
          },
        },
        promoCode: {
          select: {
            id: true,
            code: true,
            discountType: true,
            discountValue: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Booking not found",
      });
    }

    if (booking.userId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "You can only view your own bookings",
      });
    }

    res.json({ success: true, data: booking });
  } catch (error) {
    console.error("Error fetching booking:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to fetch booking",
    });
  }
});

// GET /api/bookings/:id/refund-preview - Calculate refund breakdown before cancellation
router.get("/:id/refund-preview", authenticate, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
      include: {
        event: {
          select: {
            id: true,
            name: true,
            date: true,
            refundPolicy: true,
            serviceFeePercent: true,
          },
        },
      },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Booking not found",
      });
    }

    if (booking.userId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "You can only view refund details for your own bookings",
      });
    }

    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message:
          booking.status === "CANCELLED"
            ? "This booking has already been cancelled"
            : "Only confirmed bookings can be cancelled",
      });
    }

    const refund = calculateRefund(
      booking.pricePaid,
      new Date(booking.event.date),
      booking.event.refundPolicy,
      booking.event.serviceFeePercent
    );

    res.json({
      success: true,
      data: refund,
    });
  } catch (error) {
    console.error("Error calculating refund preview:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to calculate refund preview",
    });
  }
});

// POST /api/bookings - Create booking (buy ticket)
router.post("/:id/transfer", authenticate, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: "VALIDATION_ERROR",
        message: "Recipient email is required",
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      // 1. Get booking
      const booking = await tx.booking.findUnique({
        where: { id: bookingId },
      });

      if (!booking) {
        throw new Error("NOT_FOUND:Booking not found");
      }

      // 2. Validate ownership
      if (booking.userId !== req.user!.userId) {
        throw new Error("FORBIDDEN:You can only transfer your own tickets");
      }

      // 3. Validate status
      if (booking.status === "CANCELLED") {
        throw new Error("INVALID_STATUS:Cannot transfer cancelled booking");
      }

      // 4. Find recipient
      const recipient = await tx.user.findUnique({
        where: { email },
      });

      if (!recipient) {
        throw new Error("NOT_FOUND:User not found");
      }

      if (recipient.id === booking.userId) {
        throw new Error("INVALID:Cannot transfer to yourself");
      }

      // 5. Perform transfer using shared utility
      return await transferBooking(tx, bookingId, recipient.id);
    });

    res.json({
      success: true,
      message: "Ticket transferred successfully",
      data: result,
    });
  } catch (error: any) {
    console.error("Transfer error:", error);

    if (error.message?.startsWith("NOT_FOUND:")) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: error.message.split(":")[1],
      });
    }

    if (error.message?.startsWith("FORBIDDEN:")) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: error.message.split(":")[1],
      });
    }

    if (error.message?.startsWith("INVALID_STATUS:")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: error.message.split(":")[1],
      });
    }

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to transfer ticket",
    });
  }
});

// DELETE /api/bookings/:id - Cancel booking with refund calculation
router.delete("/:id", authenticate, async (req, res) => {
  try {
    // Use an interactive transaction to prevent race conditions
    // (two concurrent cancel requests for the same booking)
    const result = await prisma.$transaction(async (tx) => {
      const booking = await tx.booking.findUnique({
        where: { id: req.params.id as string },
        include: {
          event: true,
        },
      });

      if (!booking) {
        throw new Error("NOT_FOUND:Booking not found");
      }

      if (booking.userId !== req.user!.userId) {
        throw new Error("FORBIDDEN:You can only cancel your own bookings");
      }

      if (booking.status !== "CONFIRMED") {
        throw new Error(
          booking.status === "CANCELLED"
            ? "ALREADY_CANCELLED:This booking has already been cancelled"
            : "INVALID_STATUS:Only confirmed bookings can be cancelled"
        );
      }

      // Calculate refund using the shared refund engine
      const refund = calculateRefund(
        booking.pricePaid,
        new Date(booking.event.date),
        booking.event.refundPolicy,
        booking.event.serviceFeePercent
      );

      if (!refund.canCancel) {
        throw new Error("PAST_EVENT:This event has already passed. Cancellation is not allowed.");
      }

      // Update booking status and store refund amount + cancellation timestamp
      await tx.booking.update({
        where: { id: req.params.id as string },
        data: {
          status: "CANCELLED",
          refundAmount: refund.finalRefund,
          cancelledAt: new Date(),
        },
      });

      // Decrement capacity using centralized helper
      await decrementCapacity(tx, booking);

      // Restore promo code usage if one was applied
      if (booking.promoCodeId) {
        await tx.promoCode.update({
          where: { id: booking.promoCodeId },
          data: { usageCount: { decrement: 1 } },
        });
      }

      return refund;
    });

    res.json({
      success: true,
      message: "Booking cancelled successfully",
      data: {
        refundAmount: result.finalRefund,
        refundPercentage: result.refundPercentage,
        serviceFee: result.serviceFee,
      },
    });
  } catch (error: unknown) {
    const err = error as Error;
    console.error("Error cancelling booking:", err);

    if (err.message?.startsWith("NOT_FOUND:")) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("FORBIDDEN:")) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("ALREADY_CANCELLED:")) {
      return res.status(400).json({
        success: false,
        error: "ALREADY_CANCELLED",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("INVALID_STATUS:")) {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: err.message.split(":")[1],
      });
    }

    if (err.message?.startsWith("PAST_EVENT:")) {
      return res.status(400).json({
        success: false,
        error: "PAST_EVENT",
        message: err.message.split(":")[1],
      });
    }

    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to cancel booking",
    });
  }
});

// GET /api/bookings/:id/qr - Get QR code image
router.get("/:id/qr", authenticate, async (req, res) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id as string },
    });

    if (!booking) {
      return res.status(404).json({
        success: false,
        error: "NOT_FOUND",
        message: "Booking not found",
      });
    }

    if (booking.userId !== req.user!.userId) {
      return res.status(403).json({
        success: false,
        error: "FORBIDDEN",
        message: "You can only view your own tickets",
      });
    }

    if (booking.status !== "CONFIRMED") {
      return res.status(400).json({
        success: false,
        error: "INVALID_STATUS",
        message: "QR code is not available for this booking",
      });
    }

    const qrCodeImage = await generateQRCodeDataURL(booking.qrCodeData);

    res.json({
      success: true,
      data: {
        qrCode: qrCodeImage,
        ticketCode: booking.ticketCode,
      },
    });
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).json({
      success: false,
      error: "INTERNAL_ERROR",
      message: "Failed to generate QR code",
    });
  }
});

export default router;
