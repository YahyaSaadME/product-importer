import { NextRequest, NextResponse } from "next/server";

const API_URL = process.env.API_URL || "http://localhost:8010";

async function handler(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params;
  const { search } = new URL(request.url);
  const target = `${API_URL}/${path.join("/")}${search}`;

  const headers = new Headers(request.headers);
  headers.delete("host");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const body = hasBody ? await request.blob() : undefined;

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body,
  });

  const resHeaders = new Headers(upstream.headers);
  resHeaders.delete("content-encoding");

  return new NextResponse(upstream.body, {
    status: upstream.status,
    headers: resHeaders,
  });
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;
