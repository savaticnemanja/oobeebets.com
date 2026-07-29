import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

/**
 * Liveness + readiness in one. Used by the Docker HEALTHCHECK and by any load
 * balancer in front of the app: a replica that cannot reach Postgres should be
 * pulled from rotation, not left serving 500s.
 */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return NextResponse.json(
      { status: "ok", db: "up", time: new Date().toISOString() },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", db: "down" },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
