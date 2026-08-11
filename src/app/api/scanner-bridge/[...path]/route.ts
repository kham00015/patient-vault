import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ path?: string[] }> };

function bridgeBase() {
  return (
    process.env.SCANNER_BRIDGE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SCANNER_BRIDGE_URL?.trim() ||
    "http://127.0.0.1:18991"
  );
}

/**
 * Same-origin proxy to the local Windows scanner bridge.
 * Browsers (especially HTTPS pages) often cannot call http://127.0.0.1 directly.
 * This only reaches a scanner on the SAME machine running Next.js (local clinic PC).
 */
async function proxy(request: Request, pathParts: string[] | undefined) {
  const suffix = (pathParts ?? []).join("/");
  const target = `${bridgeBase().replace(/\/$/, "")}/${suffix}`;

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const init: RequestInit = {
      method: request.method,
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      init.headers = {
        ...init.headers,
        "Content-Type": request.headers.get("content-type") || "application/json",
      };
      init.body = await request.text();
    }

    try {
      const upstream = await fetch(target, init);
      clearTimeout(timer);
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: {
          "Content-Type": upstream.headers.get("content-type") || "application/json",
          "Cache-Control": "no-store",
        },
      });
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Bridge unreachable";
    return NextResponse.json(
      {
        ok: false,
        error:
          "Scanner bridge not reachable from this computer. Run: npm run scanner-bridge (keep that window open).",
        detail: msg,
      },
      { status: 503 }
    );
  }
}

export async function GET(request: Request, { params }: Params) {
  const { path } = await params;
  return proxy(request, path);
}

export async function POST(request: Request, { params }: Params) {
  const { path } = await params;
  return proxy(request, path);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
