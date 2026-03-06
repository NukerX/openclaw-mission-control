import { NextResponse } from "next/server";
import { buildModelsSummary } from "@/lib/models-summary";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await buildModelsSummary();
  return NextResponse.json(summary, {
    headers: { "Cache-Control": "no-store" },
  });
}
