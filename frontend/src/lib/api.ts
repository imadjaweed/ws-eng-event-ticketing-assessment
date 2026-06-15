const API_URL = ""; // Relative path — Next.js rewrites proxy /api/* to backend

interface FetchOptions extends RequestInit {
  token?: string | null;
}

async function fetchAPI<T>(endpoint: string, options: FetchOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.message || "Something went wrong");
  }

  return data;
}

/* =========================
   AUTH API
========================= */
export const authAPI = {
  register: (data: { email: string; password: string; name: string }) =>
    fetchAPI("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  login: (data: { email: string; password: string }) =>
    fetchAPI("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  me: (token: string) =>
    fetchAPI("/api/auth/me", { token }),

  updateProfile: (token: string, data: { name?: string }) =>
    fetchAPI("/api/auth/profile", {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),
};

/* =========================
   EVENTS API
========================= */
export const eventsAPI = {
  list: (category?: string) =>
    fetchAPI(`/api/events${category ? `?category=${category}` : ""}`),

  listAll: (token: string) =>
    fetchAPI("/api/events/all", { token }),

  get: (id: string) =>
    fetchAPI(`/api/events/${id}`),

  create: (token: string, data: any) =>
    fetchAPI("/api/events", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, id: string, data: any) =>
    fetchAPI(`/api/events/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, id: string) =>
    fetchAPI(`/api/events/${id}`, {
      method: "DELETE",
      token,
    }),

  getAttendees: (token: string, id: string) =>
    fetchAPI(`/api/events/${id}/attendees`, { token }),
};

/* =========================
   TIERS API
========================= */
export const tiersAPI = {
  list: (eventId: string) =>
    fetchAPI(`/api/events/${eventId}/tiers`),

  create: (token: string, eventId: string, data: any) =>
    fetchAPI(`/api/events/${eventId}/tiers`, {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  update: (token: string, eventId: string, tierId: string, data: any) =>
    fetchAPI(`/api/events/${eventId}/tiers/${tierId}`, {
      method: "PUT",
      body: JSON.stringify(data),
      token,
    }),

  delete: (token: string, eventId: string, tierId: string) =>
    fetchAPI(`/api/events/${eventId}/tiers/${tierId}`, {
      method: "DELETE",
      token,
    }),
};

/* =========================
   PROMO CODES API
========================= */
export const promoCodesAPI = {
  list: (token: string, eventId: string) =>
    fetchAPI(`/api/events/${eventId}/promo-codes`, { token }),

  create: (token: string, eventId: string, data: any) =>
    fetchAPI(`/api/events/${eventId}/promo-codes`, {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  validate: (token: string, eventId: string, code: string) =>
    fetchAPI(`/api/events/${eventId}/promo-codes/validate`, {
      method: "POST",
      body: JSON.stringify({ code }),
      token,
    }),

  delete: (token: string, eventId: string, codeId: string) =>
    fetchAPI(`/api/events/${eventId}/promo-codes/${codeId}`, {
      method: "DELETE",
      token,
    }),
};

/* =========================
   BOOKINGS API
========================= */
export const bookingsAPI = {
  list: (token: string) =>
    fetchAPI("/api/bookings", { token }),

  get: (token: string, id: string) =>
    fetchAPI(`/api/bookings/${id}`, { token }),

  create: (token: string, data: any) =>
    fetchAPI("/api/bookings", {
      method: "POST",
      body: JSON.stringify(data),
      token,
    }),

  cancel: (token: string, id: string) =>
    fetchAPI(`/api/bookings/${id}`, {
      method: "DELETE",
      token,
    }),

  getRefundPreview: (token: string, id: string) =>
    fetchAPI(`/api/bookings/${id}/refund-preview`, { token }),

  getQR: (token: string, id: string) =>
    fetchAPI(`/api/bookings/${id}/qr`, { token }),

  // ✅ OPTIONAL: only use if backend supports transfer later
  transfer: (token: string, id: string, toUserId: string) =>
    fetchAPI(`/api/bookings/${id}/transfer`, {
      method: "POST",
      body: JSON.stringify({ toUserId }),
      token,
    }),
};

/* =========================
   DASHBOARD API
========================= */
export const dashboardAPI = {
  getStats: (token: string) =>
    fetchAPI("/api/dashboard/stats", { token }),

  getEventStats: (token: string, id: string) =>
    fetchAPI(`/api/dashboard/events/${id}/stats`, { token }),

  getVelocity: (token: string) =>
    fetchAPI("/api/dashboard/velocity", { token }),
};
