import { NextRequest, NextResponse } from "next/server";
import { fetchVpsAccount } from "@/lib/vpsBridge";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const customUrl = searchParams.get("vps_url") || undefined;
    const account = await fetchVpsAccount(customUrl);
    return NextResponse.json({ status: "success", account });
  } catch (err: any) {
    return NextResponse.json({
      status: "success",
      account: {
        connected: false,
        balance: 20.0,
        equity: 20.0,
        currency: "USD",
        source: "SMART_LEDGER_FALLBACK",
      },
    });
  }
}
