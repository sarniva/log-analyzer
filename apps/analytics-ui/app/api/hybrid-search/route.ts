import { NextResponse } from "next/server";
import { hybridSearch } from "@/lib/server/hybrid-search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      query?: string;
      tenantId?: string;
      limit?: number;
    };

    if (!body.query || typeof body.query !== "string") {
      return NextResponse.json({ error: "`query` is required." }, { status: 400 });
    }

    const result = await hybridSearch({
      query: body.query,
      tenantId: typeof body.tenantId === "string" && body.tenantId.trim() ? body.tenantId.trim() : undefined,
      limit: typeof body.limit === "number" ? body.limit : 10,
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Hybrid search failed.",
      },
      { status: 500 },
    );
  }
}
