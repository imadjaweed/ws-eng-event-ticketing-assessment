"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Booking } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { bookingsAPI } from "@/lib/api";
import { formatDate, formatTime, formatCurrency } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { Alert } from "@/components/ui/Alert";

export default function TicketPage() {
  const params = useParams();
  const router = useRouter();
  const { user, token, isLoading: authLoading } = useAuth();

  const [booking, setBooking] = useState<Booking | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);

  const [transferUserId, setTransferUserId] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (authLoading) return;

    if (!user || !token) {
      router.push(`/login?callbackUrl=/tickets/${params.id}`);
      return;
    }

    Promise.all([
      bookingsAPI.get(token, params.id as string),
      bookingsAPI.getQR(token, params.id as string),
    ])
      .then(([bookingRes, qrRes]) => {
        setBooking(bookingRes.data);
        setQrCode(qrRes.data.qrCode);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [user, token, authLoading, router, params.id]);

  const handleTransfer = async () => {
    if (!token || !booking || !transferUserId) return;

    try {
      setIsTransferring(true);

      await bookingsAPI.transfer(token, booking.id, transferUserId);

      alert("Ticket transferred successfully!");

      // 🔥 FIX: force refresh so UI updates correctly
      router.refresh();
      router.push("/bookings");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setIsTransferring(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div className="container py-8 text-center text-red-600">
        {error || "Ticket not found"}
      </div>
    );
  }

  if (booking.status !== "CONFIRMED") {
    return (
      <div className="container py-8">
        <Alert variant="warning">
          This ticket is no longer valid. Status: {booking.status}
        </Alert>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="max-w-md mx-auto">
        <Card>
          <CardContent className="text-center space-y-6 py-8">

            <h1 className="text-2xl font-bold text-gray-900">
              {booking.event?.name}
            </h1>

            {qrCode && (
              <div className="flex justify-center">
                <img src={qrCode} className="w-64 h-64" />
              </div>
            )}

            <div className="space-y-2 text-sm">

              <div className="flex justify-between border-b py-2">
                <span>Date</span>
                <span>{formatDate(booking.event!.date)}</span>
              </div>

              <div className="flex justify-between border-b py-2">
                <span>Time</span>
                <span>{formatTime(booking.event!.time)}</span>
              </div>

              <div className="flex justify-between border-b py-2">
                <span>Venue</span>
                <span>{booking.event?.venue}</span>
              </div>

              <div className="flex justify-between border-b py-2">
                <span>Price</span>
                <span>{formatCurrency(booking.pricePaid)}</span>
              </div>

            </div>

            {/* QR */}
            <Button
              className="w-full"
              onClick={() => qrCode && window.open(qrCode, "_blank")}
            >
              Download QR Code
            </Button>

            {/* TRANSFER */}
            <div className="border-t pt-4 space-y-2">
              <input
                value={transferUserId}
                onChange={(e) => setTransferUserId(e.target.value)}
                placeholder="Receiver User ID"
                className="w-full border p-2 rounded"
              />

              <Button
                className="w-full"
                onClick={handleTransfer}
                disabled={isTransferring}
              >
                {isTransferring ? "Transferring..." : "Transfer Ticket"}
              </Button>
            </div>

            <Button
              variant="ghost"
              className="w-full"
              onClick={() => router.push("/bookings")}
            >
              Back to Bookings
            </Button>

          </CardContent>
        </Card>
      </div>
    </div>
  );
}
