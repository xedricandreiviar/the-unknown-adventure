import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { problemSchema, z } from "@/lib/validation";

type Context = { supabase: import("@supabase/supabase-js").SupabaseClient; userId: string };

async function assertAdmin(context: Context) {
  const { data } = await context.supabase.rpc("is_admin");
  if (!data) throw new Error("Admin access required.");
}

export const getMyProblemReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("problem_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const submitProblemReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => problemSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("status")
      .eq("id", context.userId)
      .single();
    if (profile?.status !== "approved") throw new Error("Your account must be approved before submitting a report.");
    const { data: flag } = await context.supabase
      .from("feature_flags")
      .select("enabled")
      .eq("key", "problems")
      .maybeSingle();
    if (flag && !flag.enabled) throw new Error("Problem reports are temporarily unavailable.");
    if (data.photo_path && !data.photo_path.startsWith(`${context.userId}/`)) {
      throw new Error("That photo does not belong to your account.");
    }
    const { error } = await context.supabase
      .from("problem_reports")
      .insert({ ...data, photo_path: data.photo_path ?? null, user_id: context.userId });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

/** A short-lived link to a report's photo. Works for the resident who filed it and for admins. */
export const getReportPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: report } = await context.supabase
      .from("problem_reports")
      .select("photo_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!report?.photo_path) throw new Error("This report has no photo.");
    const { data: signed, error } = await context.supabase.storage
      .from("uploads")
      .createSignedUrl(report.photo_path, 300);
    if (error || !signed) throw new Error(error?.message ?? "Could not open the photo.");
    return { url: signed.signedUrl };
  });

export const adminListProblemReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("problem_reports")
      .select("*, resident:profiles(first_name, middle_name, last_name, email)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminUpdateProblemReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["submitted", "under_review", "in_progress", "resolved", "rejected"]),
      admin_reply: z.string().trim().max(1000).optional(),
    })
      .refine((d) => d.status !== "rejected" || (d.admin_reply ?? "").length >= 5, {
        message: "Give a rejection reason (at least 5 characters).",
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: report } = await context.supabase
      .from("problem_reports")
      .select("user_id")
      .eq("id", data.id)
      .single();
    if (!report) throw new Error("Report not found.");
    const { error } = await context.supabase
      .from("problem_reports")
      // Keep any earlier reply when the admin only moves the status along.
      .update(
        data.admin_reply
          ? { status: data.status, admin_reply: data.admin_reply }
          : { status: data.status },
      )
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { error: notificationError } = await context.supabase.from("notifications").insert({
      user_id: report.user_id,
      title: "Problem report updated",
      body: `Your report status is now ${data.status.replaceAll("_", " ")}.${data.admin_reply ? ` ${data.admin_reply}` : ""}`,
      link: "/account",
    });
    if (notificationError) throw new Error(notificationError.message);
    return { ok: true as const };
  });

export const adminListBenefitReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("benefit_releases")
      .select("*, resident:profiles(first_name, middle_name, last_name, email)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminSaveBenefitRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    id: z.string().uuid().optional(),
    user_id: z.string().uuid(),
    kind: z.enum(["senior", "pwd"]),
    description: z.string().trim().min(1).max(250),
    status: z.enum(["pending", "approved", "ready_for_release", "released"]),
    date_released: z.string().nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...values } = data;
    const row = { ...values, date_released: values.date_released || null, notes: values.notes || null };
    const result = id
      ? await context.supabase.from("benefit_releases").update(row).eq("id", id).select("user_id").single()
      : await context.supabase.from("benefit_releases").insert(row).select("user_id").single();
    if (result.error) throw new Error(result.error.message);
    const { error } = await context.supabase.from("notifications").insert({
      user_id: result.data.user_id,
      title: "Benefit release updated",
      body: `${values.description} — ${values.status.replaceAll("_", " ")}`,
      link: "/account",
    });
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const getMyBenefitReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("benefit_releases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });