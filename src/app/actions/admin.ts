"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditLog, picks, slates, users, subscriptions } from "@/db/schema";
import type { AuthContext } from "@/lib/auth";
import { canManageRole, requireAdmin, requireOwner, revokeAllSessions } from "@/lib/auth";
import { setSetting } from "@/lib/settings";
import {
  fieldErrorsFrom,
  pickSchema,
  settleSchema,
  type ActionState,
} from "@/lib/validation";
import { isValidSlateDate } from "@/lib/slate-date";
import { z } from "zod";

async function audit(
  actor: AuthContext,
  action: string,
  entity: string,
  entityId?: string,
  meta?: Record<string, unknown>,
) {
  await db.insert(auditLog).values({
    actorId: actor.user.id,
    actorEmail: actor.user.email,
    action,
    entity,
    entityId: entityId ?? null,
    meta: meta ?? null,
  });
}

function revalidateSlate(date: string) {
  revalidatePath("/picks");
  revalidatePath("/track-record");
  revalidatePath("/");
  revalidatePath(`/admin/slate`);
  revalidatePath(`/admin/settle`);
  void date;
}

/* ------------------------------------------------------------ create pick */

export async function createPickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = pickSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  const startsAt = new Date(d.startsAt);
  if (Number.isNaN(startsAt.getTime())) {
    return { ok: false, error: "Invalid kick-off time", fieldErrors: { startsAt: ["Invalid date"] } };
  }

  try {
    await db.transaction(async (tx) => {
      await tx
        .insert(slates)
        .values({ date: d.slateDate })
        .onConflictDoNothing({ target: slates.date });

      await tx.insert(picks).values({
        slateDate: d.slateDate,
        rank: d.rank,
        sport: d.sport,
        league: d.league,
        event: d.event,
        startsAt,
        market: d.market,
        selection: d.selection,
        price: d.price,
        book: d.book || null,
        units: String(d.units),
        confidence: d.confidence ?? null,
        evPct: d.evPct !== undefined ? String(d.evPct) : null,
        reasoning: d.reasoning || null,
      });
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("picks_slate_rank_unique")) {
      return {
        ok: false,
        error: `Rank ${d.rank} is already taken on ${d.slateDate}`,
        fieldErrors: { rank: ["Already used"] },
      };
    }
    throw err;
  }

  await audit(actor, "pick.created", "pick", undefined, { slateDate: d.slateDate, rank: d.rank });
  revalidateSlate(d.slateDate);
  return { ok: true, message: `Rank ${d.rank} added.` };
}

/* ------------------------------------------------------------ delete pick */

export async function deletePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("pickId"));
  if (!id.success) return { ok: false, error: "Bad pick id" };

  const [existing] = await db.select().from(picks).where(eq(picks.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  const [slate] = await db
    .select()
    .from(slates)
    .where(eq(slates.date, existing.slateDate))
    .limit(1);

  // Published picks are immutable (FR-P5). Removing one would rewrite history;
  // the correct action is a void, which stays visible on the record.
  if (slate?.publishedAt) {
    return { ok: false, error: "Slate is published — void the pick instead of deleting it." };
  }

  await db.delete(picks).where(eq(picks.id, id.data));
  await audit(actor, "pick.deleted", "pick", id.data, { rank: existing.rank });
  revalidateSlate(existing.slateDate);
  return { ok: true, message: "Pick removed." };
}

/* --------------------------------------------------------- publish slate */

export async function publishSlateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const date = String(formData.get("slateDate") ?? "");
  if (!isValidSlateDate(date)) return { ok: false, error: "Bad slate date" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(picks)
    .where(eq(picks.slateDate, date));

  if (n === 0) return { ok: false, error: "Nothing to publish — add picks first." };

  await db
    .update(slates)
    .set({ publishedAt: new Date(), publishedBy: actor.user.id })
    .where(and(eq(slates.date, date), sql`${slates.publishedAt} is null`));

  await audit(actor, "slate.published", "slate", date, { pickCount: n });
  revalidateSlate(date);
  return { ok: true, message: `Slate published — ${n} picks live.` };
}

export async function unpublishSlateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const date = String(formData.get("slateDate") ?? "");
  if (!isValidSlateDate(date)) return { ok: false, error: "Bad slate date" };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(picks)
    .where(and(eq(picks.slateDate, date), sql`${picks.settledAt} is not null`));

  // Once results are on the public record, pulling the slate would be editing
  // history after the fact.
  if (n > 0) {
    return { ok: false, error: "Picks are already settled — this slate is part of the record." };
  }

  await db.update(slates).set({ publishedAt: null, publishedBy: null }).where(eq(slates.date, date));
  await audit(actor, "slate.unpublished", "slate", date);
  revalidateSlate(date);
  return { ok: true, message: "Slate pulled back to draft." };
}

/* --------------------------------------------------------------- settle */

export async function settlePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = settleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const { pickId, status, finalScore, voidReason } = parsed.data;

  if (status === "void" && !voidReason) {
    return { ok: false, error: "A void needs a reason — it goes in the audit log." };
  }

  const [existing] = await db.select().from(picks).where(eq(picks.id, pickId)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  await db
    .update(picks)
    .set({
      status,
      finalScore: finalScore || null,
      voidReason: voidReason || null,
      settledAt: new Date(),
      settledBy: actor.user.id,
      updatedAt: new Date(),
    })
    .where(eq(picks.id, pickId));

  await audit(actor, `pick.settled.${status}`, "pick", pickId, {
    from: existing.status,
    to: status,
    finalScore,
    voidReason,
  });

  revalidateSlate(existing.slateDate);
  return { ok: true, message: `Settled as ${status}.` };
}

export async function unsettlePickAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();
  const id = z.string().uuid().safeParse(formData.get("pickId"));
  if (!id.success) return { ok: false, error: "Bad pick id" };

  const [existing] = await db.select().from(picks).where(eq(picks.id, id.data)).limit(1);
  if (!existing) return { ok: false, error: "Pick not found" };

  await db
    .update(picks)
    .set({ status: "pending", finalScore: null, settledAt: null, settledBy: null, voidReason: null })
    .where(eq(picks.id, id.data));

  // Correcting a mis-settle is legitimate, but it changes published numbers,
  // so it is logged loudly rather than silently allowed.
  await audit(actor, "pick.unsettled", "pick", id.data, { was: existing.status });
  revalidateSlate(existing.slateDate);
  return { ok: true, message: "Reset to pending." };
}

/* ---------------------------------------------------------------- users */

export async function setUserRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireOwner();

  const parsed = z
    .object({
      userId: z.string().uuid(),
      role: z.enum(["user", "admin", "owner"]),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Bad request" };

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, parsed.data.userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  if (!canManageRole(actor, target)) {
    return { ok: false, error: "You can't change your own role." };
  }

  // Never let the last owner be demoted — that would lock everyone out of role
  // management permanently, with no recovery path short of a SQL console.
  if (target.role === "owner" && parsed.data.role !== "owner") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "owner"));
    if (n <= 1) return { ok: false, error: "There must be at least one owner." };
  }

  await db
    .update(users)
    .set({ role: parsed.data.role, updatedAt: new Date() })
    .where(eq(users.id, target.id));

  // A demoted admin must lose admin pages immediately, not at session expiry.
  if (target.role !== "user" && parsed.data.role === "user") {
    await revokeAllSessions(target.id);
  }

  await audit(actor, "user.role_changed", "user", target.id, {
    from: target.role,
    to: parsed.data.role,
    email: target.email,
  });

  revalidatePath("/admin/users");
  return { ok: true, message: `${target.email} is now ${parsed.data.role}.` };
}

export async function grantSubscriptionAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = z
    .object({ userId: z.string().uuid(), tier: z.enum(["base", "pro", "elite"]) })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "Bad request" };

  const end = new Date();
  end.setDate(end.getDate() + 30);

  await db
    .insert(subscriptions)
    .values({
      userId: parsed.data.userId,
      tier: parsed.data.tier,
      status: "active",
      priceCents: 0,
      currentPeriodEnd: end,
      stripeSubscriptionId: `comp_${crypto.randomUUID()}`,
    })
    .onConflictDoNothing();

  await audit(actor, "subscription.granted", "user", parsed.data.userId, {
    tier: parsed.data.tier,
  });

  revalidatePath("/admin/users");
  return { ok: true, message: "Comped 30 days." };
}

/* ------------------------------------------------------------- settings */

export async function updateSettingsAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await requireAdmin();

  const parsed = z
    .object({
      trialsEnabled: z.coerce.boolean(),
      seatCap: z.coerce.number().int().min(1).max(100000),
      basePrice: z.coerce.number().int().min(0),
      proPrice: z.coerce.number().int().min(0),
      elitePrice: z.coerce.number().int().min(0),
      nextPriceRiseAt: z.string().optional(),
    })
    .safeParse({
      trialsEnabled: formData.get("trialsEnabled") === "on",
      seatCap: formData.get("seatCap"),
      basePrice: formData.get("basePrice"),
      proPrice: formData.get("proPrice"),
      elitePrice: formData.get("elitePrice"),
      nextPriceRiseAt: formData.get("nextPriceRiseAt") ?? "",
    });

  if (!parsed.success) {
    return { ok: false, error: "Check the fields", fieldErrors: fieldErrorsFrom(parsed.error) };
  }
  const d = parsed.data;

  await setSetting("trialsEnabled", d.trialsEnabled, actor.user.id);
  await setSetting("seatCap", d.seatCap, actor.user.id);
  await setSetting(
    "pricing",
    { base: d.basePrice * 100, pro: d.proPrice * 100, elite: d.elitePrice * 100 },
    actor.user.id,
  );
  await setSetting(
    "nextPriceRiseAt",
    d.nextPriceRiseAt && isValidSlateDate(d.nextPriceRiseAt) ? d.nextPriceRiseAt : null,
    actor.user.id,
  );

  await audit(actor, "settings.updated", "settings", undefined, d);

  revalidatePath("/pricing");
  revalidatePath("/admin/settings");
  return { ok: true, message: "Settings saved." };
}
