import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { settingsSchema, serviceSchema, newsSchema } from "@/lib/validation";
import { z } from "zod";

/** Publishable client for anonymous public reads (narrow TO-anon SELECT policies). */
function publicClient() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
}

export const getSiteData = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const [settings, services, flags] = await Promise.all([
    supabase.from("site_settings").select("*").eq("id", 1).maybeSingle(),
    supabase.from("services").select("*").order("sort"),
    supabase.from("feature_flags").select("*").order("sort"),
  ]);
  return {
    settings: settings.data,
    services: services.data ?? [],
    flags: flags.data ?? [],
  };
});

export const getAnnouncements = createServerFn({ method: "GET" }).handler(async () => {
  const supabase = publicClient();
  const { data, error } = await supabase
    .from("announcements")
    .select("id, title, body, category, image_path, published_at, created_at")
    .eq("published", true)
    .order("published_at", { ascending: false });
  if (error) throw new Error("Announcements are temporarily unavailable.");
  return data ?? [];
});

export type SiteSettings = NonNullable<
  Awaited<ReturnType<typeof getSiteData>>["settings"]
>;
export type SiteService = Awaited<ReturnType<typeof getSiteData>>["services"][number];
export type SiteFlag = Awaited<ReturnType<typeof getSiteData>>["flags"][number];

async function assertAdmin(context: { supabase: ReturnType<typeof createClient<Database>> }) {
  const { data: admin } = await context.supabase.rpc("is_admin");
  if (!admin) throw new Error("Admin access required.");
}

export const updateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => settingsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("site_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const saveService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => serviceSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...values } = data;
    if (id) {
      const { error } = await context.supabase.from("services").update(values).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("services").insert(values);
      if (error) throw new Error(error.message);
    }
    return { ok: true as const };
  });

export const deleteService = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("services").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ key: z.string().min(1).max(60), enabled: z.boolean() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("feature_flags")
      .update({ enabled: data.enabled })
      .eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const adminListAnnouncements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.from("announcements").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const saveAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => newsSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const values = { title: data.title, category: data.category, body: data.body, image_path: data.image_path ?? null, published: data.published, published_at: data.published ? new Date().toISOString() : null };
    const { id } = data;
    const { error } = id
      ? await context.supabase.from("announcements").update(values).eq("id", id)
      : await context.supabase.from("announcements").insert(values);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });

export const deleteAnnouncement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.from("announcements").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
