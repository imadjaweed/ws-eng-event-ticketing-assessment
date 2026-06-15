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
  const [email, setEmail] = useState("");
  const [isTransferring, setIsTransferring] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const bookingId = params.id as string;

  useEffect(() => {
    if (authLoading) return;

    if (!user || !token) {
      router.push(`/login?callbackUrl=/tickets/${bookingId}`);
      return;
    }

    Promise.all([
      bookingsAPI.get(token, bookingId),
      bookingsAPI.getQR(token, bookingId),
    ])
      .then(([bookingRes, qrRes]) => {
        setBooking(bookingRes.data);
        setQrCode(qrRes.data.qrCode);
      })
      .catch((err) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, [user, token, authLoading, bookingId, router]);

  const handleTransfer = async () => {
    if (!token || !booking || !email) return;

    try {
      setIsTransferring(true);

      const res = await fetch(`/api/bookings/${booking.id}/transfer`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ toEmail: email }),
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Transfer failed");

      alert("Ticket transferred successfully!");

      // 🔥 IMPORTANT: refresh data after transfer
      const updated = await bookingsAPI.list(token);
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

            <h1 className="text-2xl font-bold">
              {booking.event?.name}
            </h1>

            {qrCode && (
              <img src={qrCode} className="w-64 h-64 mx-auto" />
            )}

            {/* ================= TRANSFER FORM ================= */}
            <div className="border-t pt-4 space-y-2">
              <input
                type="email"
                placeholder="Enter recipient email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
