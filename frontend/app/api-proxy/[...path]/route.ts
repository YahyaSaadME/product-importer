import { NextRequest, NextResponse } from "next/server";

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
  "content-length",
]);

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  // Read inside the handler so Next.js build-time bundler cannot inline as undefined
  const apiUrl = (process.env["API_URL"] ?? "http://localhost:8010").replace(/\/$/, "");

  let target = "";
  try {
    const { path } = await params;
    const { search } = new URL(request.url);
    target = `${apiUrl}/${path.join("/")}${search}`;

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
    const cause = (err as NodeJS.ErrnoException)?.cause;
    console.error("[api-proxy] target:", target || "(not set)");
    console.error("[api-proxy] API_URL env:", apiUrl);
    console.error("[api-proxy] error:", err);
    console.error("[api-proxy] cause:", cause);
    return NextResponse.json(
      {
        error: "proxy_error",
        target,
        api_url: apiUrl,
        detail: String(err),
        cause: String(cause ?? "none"),
      },
      { status: 502 }
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
