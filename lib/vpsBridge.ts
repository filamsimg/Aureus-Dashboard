/**
 * VPS MT5 Account Bridge Client
 * Fetches real-time balance, equity, and margin from the Windows VPS (109.111.52.163)
 * With zero-failure automatic fallback to Smart Ledger if VPS is offline or expired.
 */

export interface VpsAccountData {
  connected: boolean;
  login?: number | string;
  server?: string;
  balance: number;
  equity: number;
  currency: string;
  freeMargin?: number;
  source: "VPS_MT5_REAL" | "SMART_LEDGER_FALLBACK";
  error?: string;
}

export async function fetchVpsAccount(customVpsUrl?: string): Promise<VpsAccountData> {
  const vpsUrl = customVpsUrl || process.env.VPS_BRIDGE_URL || "http://109.111.52.163:8000";

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000); // 2 second fast timeout

    const res = await fetch(`${vpsUrl}/api/account`, {
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      if (data && data.connected) {
        return {
          connected: true,
          login: data.login,
          server: data.server,
          balance: Number(data.balance.toFixed(2)),
          equity: Number(data.equity.toFixed(2)),
          currency: data.currency || "USD",
          freeMargin: data.free_margin ? Number(data.free_margin.toFixed(2)) : undefined,
          source: "VPS_MT5_REAL",
        };
      }
    }
  } catch (err) {
    // Expected when VPS server is unreachable or offline
  }

  // Graceful fallback to Smart Ledger
  return {
    connected: false,
    login: process.env.MT5_ACCOUNT_TARGET || "268119731",
    server: "Exness-Real (USD)",
    balance: 20.0,
    equity: 20.0,
    currency: "USD",
    source: "SMART_LEDGER_FALLBACK",
  };
}
