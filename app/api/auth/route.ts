import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";

const AUTH_COOKIE_NAME = "aureus_auth_session";
// Default PIN matching Magic Number suffix or configured via .env.local
const DEFAULT_PIN = process.env.DASHBOARD_PIN || "8898";

export async function GET(req: NextRequest) {
  try {
    const cookieStore = cookies();
    const token = cookieStore.get(AUTH_COOKIE_NAME);
    const isAuthenticated = token?.value === "authenticated_access_granted";

    return NextResponse.json({
      status: "success",
      authenticated: isAuthenticated,
    });
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", authenticated: false, message: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const inputPin = String(body.pin || "").trim();

    const expectedPin = String(process.env.DASHBOARD_PIN || DEFAULT_PIN).trim();

    if (inputPin === expectedPin) {
      const response = NextResponse.json({
        status: "success",
        message: "Otorisasi berhasil. Selamat datang di Aureus Dashboard.",
      });

      // 30 days secure HTTP-only cookie
      response.cookies.set({
        name: AUTH_COOKIE_NAME,
        value: "authenticated_access_granted",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 30 * 24 * 60 * 60, // 30 hari
      });

      return response;
    }

    return NextResponse.json(
      { status: "error", message: "PIN keamanan salah! Akses ditolak." },
      { status: 401 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message || "Gagal memproses otorisasi." },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const response = NextResponse.json({
      status: "success",
      message: "Sesi berhasil ditutup.",
    });

    response.cookies.set({
      name: AUTH_COOKIE_NAME,
      value: "",
      httpOnly: true,
      path: "/",
      maxAge: 0,
    });

    return response;
  } catch (error: any) {
    return NextResponse.json(
      { status: "error", message: error.message },
      { status: 500 }
    );
  }
}
