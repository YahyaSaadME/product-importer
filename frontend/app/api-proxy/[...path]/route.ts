import { NextRequest, NextResponse } from "next/server";

const API_URL = (process.env.API_URL || "http://localhost:8010").replace(/\/$/, "");

// Headers that must not be forwarded between hops
const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length", // let fetch recalculate from the actual body
]);

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  try {
    const { path } = await params;
    const { search } = new URL(request.url);
    const target = `${API_URL}/${path.join("/")}${search}`;

    const reqHeaders = new Headers();
    request.headers.forEach((value, key) => {
      if (!HOP_BY_HOP.has(key.toLowerCase())) {
        reqHeaders.set(key, value);
      }
    });

    const hasBody = request.method !== "GET" && request.method !== "HEAD";
    const body = hasBody ? await request.blob() : undefined;

    const upstream = await fetch(target, {
      method: request.method,
      headers: reqHeaders,
      body,
      cache: "no-store",
    });

    const resHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (!HOP_BY_HOP.has(k) && k !== "content-encoding") {
        resHeaders.set(key, value);
      }
    });

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers: resHeaders,
    });
  } catch (err) {
    console.error("[api-proxy] upstream error:", err);
    return NextResponse.json(
      { error: "proxy_error", detail: String(err) },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
