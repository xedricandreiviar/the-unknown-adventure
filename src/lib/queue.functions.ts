import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requestSchema,
  dateString,
  DETAILS_MIN_LENGTH,
  DETAILS_REQUIRED_SERVICE_CODES,
  REQUEST_PROFILE_FIELDS,
} from "@/lib/validation";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

type Ctx = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function assertAdmin(context: Ctx) {
  const { data: admin } = await context.supabase.rpc("is_admin");
  if (!admin) throw new Error("Admin access required.");
}

async function notify(
  supabase: Ctx["supabase"],
  userId: string,
  title: string,
  body: string,
  link?: string,
) {
  await supabase.from("notifications").insert({ user_id: userId, title, body, link: link ?? null });
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function makeCode(prefix: string) {
  const random = crypto.getRandomValues(new Uint8Array(6));
  let out = "";
  for (const value of random) out += CODE_CHARS[value % CODE_CHARS.length];
  return `${prefix}-${out}`;
}

export const submitRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: flag } = await context.supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "queueing")
      .maybeSingle();
    if (flag && !flag.enabled) {
      throw new Error("Service requests are currently turned off by the barangay.");
    }

    const { data: profile } = await context.supabase
      .from("profiles")
      .select("status, first_name, last_name, street, purok, contact_number")
      .eq("id", context.userId)
      .single();
    if (profile?.status !== "approved") {
      throw new Error("Your account must be approved before filing a request.");
    }
    if (REQUEST_PROFILE_FIELDS.some((field) => !String(profile[field] ?? "").trim())) {
      throw new Error("Complete your name, address, and contact number in My Account before filing a request.");
    }

    const { data: service } = await context.supabase
      .from("services")
      .select("id, code, enabled, name, weekly_limit")
      .eq("id", data.service_id)
      .single();
    if (!service) throw new Error("Choose a valid service.");
    if (!service.enabled) throw new Error("This service is currently unavailable.");
    if (DETAILS_REQUIRED_SERVICE_CODES.includes(service.code) && data.details.length < DETAILS_MIN_LENGTH) {
      throw new Error(`Describe the matter in at least ${DETAILS_MIN_LENGTH} characters.`);
    }

    // Weekly limit check (1 request per service per week by default)
    const weeklyLimit = (service as unknown as { weekly_limit?: number }).weekly_limit ?? 1;
    if (weeklyLimit > 0) {
      const { data: weekCount } = await context.supabase.rpc("resident_weekly_requests", {
        _user_id:    context.userId,
        _service_id: data.service_id,
      });
      if ((weekCount ?? 0) >= weeklyLimit) {
        throw new Error(
          `You can only request ${service.name} once per week. Check My Account to track your existing request.`,
        );
      }
    }

    // No duplicate active entries for the same service (belt-and-suspenders)
    const { data: dup } = await context.supabase
      .from("service_requests")
      .select("code")
      .eq("user_id", context.userId)
      .eq("service_id", data.service_id)
      .in("status", ["pending", "in_queue", "processing", "ready"])
      .maybeSingle();
    if (dup) {
      throw new Error(
        `You already have an active request for this service (reference ${dup.code}). Track it from My Account.`,
      );
    }

    // Compute estimated pickup date using the DB function
    const { data: pickupDate } = await context.supabase.rpc("compute_pickup_date");
    const pickup = pickupDate as string | null;

    let lastError: string | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data: inserted, error } = await context.supabase
        .from("service_requests")
        .insert({
          service_id:  data.service_id,
          details:     data.details,
          user_id:     context.userId,
          code:        makeCode(service.code),
          pickup_date: pickup,
        })
        .select("code, pickup_date")
        .single();
      if (!error && inserted) {
        const code = inserted.code as string;
        const pd = (inserted as unknown as { pickup_date: string | null }).pickup_date;

        // Notify the resident that their request was received
        await notify(
          context.supabase,
          context.userId,
          `Request filed: ${service.name}`,
          `Your request ${code} has been received.${pd ? ` Estimated pickup: ${new Date(pd).toLocaleDateString("en-PH")}.` : ""} Bring your requirements when you collect it.`,
          "/account",
        );

        // Notify all admins that a new request is waiting
        const { data: admins } = await context.supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "admin");
        if (admins && admins.length > 0) {
          await context.supabase.from("notifications").insert(
            admins.map((a) => ({
              user_id: a.user_id,
              title:   `New request: ${service.name}`,
              body:    `${profile.first_name} ${profile.last_name} filed ${code}.`,
              link:    "/admin/requests",
            })),
          );
        }

        return { code, pickup_date: pd };
      }
      if (error.code === "23505") lastError = error.message;
      else throw new Error(error.message);
    }
    throw new Error(lastError ?? "Could not file the request. Please try again.");
  });

export const getMyRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("service_requests")
      .select("*, service:services(name, fee, code)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getMyRequestByCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ code: z.string().trim().min(3).max(24) }).parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("service_requests")
      .select("code, status, rejection_reason, created_at, service:services(name)")
      .eq("code", data.code.toUpperCase())
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const cancelMyRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    // Fetch the code and service name before cancelling so we can use them in the notification
    const { data: row } = await context.supabase
      .from("service_requests")
      .select("code, service:services(name)")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();

    const { error } = await context.supabase
      .from("service_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);

    if (row) {
      const serviceName = (row.service as { name: string } | null)?.name ?? "service";
      await notify(
        context.supabase,
        context.userId,
        `Request cancelled: ${serviceName}`,
        `Your request ${row.code} has been cancelled. You can file a new one anytime.`,
        "/account",
      );
    }

    return { ok: true as const };
  });

export const adminListRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        status: z.enum(["pending", "in_queue", "processing", "completed", "rejected", "cancelled"]).optional(),
        from: dateString.optional(),
        to: dateString.optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let query = context.supabase
      .from("service_requests")
      .select(
        "*, service:services(name, fee, code), resident:profiles(first_name, middle_name, last_name, street, purok, barangay, contact_number, is_senior, is_pwd)",
      )
      // FIFO: oldest pending/active first, then newest for completed/closed
      .order("created_at", { ascending: true });
    if (data.status) query = query.eq("status", data.status);
    if (data.from) query = query.gte("created_at", `${data.from}T00:00:00Z`);
    if (data.to) query = query.lte("created_at", `${data.to}T23:59:59Z`);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Returns today's quota (from site_settings) and how many requests are assigned today. */
export const getRequestQuotaStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);

    // Use compute_pickup_date() to find the current target date — this is the same
    // date new requests will be assigned to, so the bar always reflects real remaining capacity.
    const [settingsResult, pickupResult] = await Promise.all([
      context.supabase.from("site_settings").select("daily_quota").eq("id", 1).maybeSingle(),
      context.supabase.rpc("compute_pickup_date"),
    ]);

    const quota = (settingsResult.data as { daily_quota?: number } | null)?.daily_quota ?? 20;
    const targetDate = (pickupResult.data as string | null) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    const countResult = await context.supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("pickup_date", targetDate)
      .not("status", "in", '("cancelled","rejected")');

    return {
      quota,
      todayCount: countResult.count ?? 0,
      today: targetDate,
    };
  });

/**
 * Public (authenticated residents) version of quota stats.
 * Returns how many of the next pickup day's slots are taken so the resident form can
 * warn them about overflow pickup dates.
 */
export const getResidentQuotaInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [settingsResult, pickupResult] = await Promise.all([
      context.supabase.from("site_settings").select("daily_quota").eq("id", 1).maybeSingle(),
      context.supabase.rpc("compute_pickup_date"),
    ]);

    const quota = (settingsResult.data as { daily_quota?: number } | null)?.daily_quota ?? 20;
    const targetDate = (pickupResult.data as string | null) ?? new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

    const countResult = await context.supabase
      .from("service_requests")
      .select("id", { count: "exact", head: true })
      .eq("pickup_date", targetDate)
      .not("status", "in", '("cancelled","rejected")');

    const todayCount = countResult.count ?? 0;
    return { quota, todayCount, isFull: todayCount >= quota, targetDate };
  });

export const adminUpdateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "in_queue", "processing", "ready", "completed", "rejected", "cancelled"]),
        reason: z.string().trim().max(500).optional(),
      })
      .refine((d) => d.status !== "rejected" || (d.reason ?? "").length >= 5, {
          message: "Give a rejection reason (at least 5 characters).",
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row } = await context.supabase
      .from("service_requests")
      .select("code, user_id, service:services(name, fee), resident:profiles(first_name, middle_name, last_name, street, purok, barangay, contact_number)")
      .eq("id", data.id)
      .single();
    if (!row) throw new Error("Request not found.");

    const { error } = await context.supabase
      .from("service_requests")
      .update({
        status: data.status,
        rejection_reason: data.status === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);

    const label: Record<string, string> = {
      pending:    "set back to Pending",
      in_queue:   "placed In Queue",
      processing: "being processed",
      ready:      "ready for pickup — please visit the barangay hall",
      completed:  "completed",
      rejected:   "rejected",
      cancelled:  "cancelled",
    };

    // When marked "ready", generate the certificate PDF via the C# API
    if (data.status === "ready") {
      const csharpUrl = process.env["VITE_CSHARP_API_URL"] ?? process.env["CSHARP_API_URL"] ?? "http://localhost:5000";
      const session = await context.supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (token && csharpUrl) {
        try {
          // Fire-and-forget — don't block the status update if the C# API is down
          void fetch(`${csharpUrl}/api/certificates/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ request_id: data.id }),
          });
        } catch {
          // Non-fatal
        }
      }
    }

    await notify(
      context.supabase,
      row.user_id,
      `Request ${row.code} ${data.status === "rejected" ? "rejected" : "updated"}`,
      data.status === "rejected"
        ? `Your request ${row.code} was rejected. Reason: ${data.reason ?? "Not specified."}`
        : `Your request ${row.code} has been ${label[data.status]}.`,
      "/account",
    );
    return { ok: true as const };
  });
