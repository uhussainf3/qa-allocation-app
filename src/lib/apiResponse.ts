import { NextResponse } from "next/server";

export const ok = (data: unknown, status = 200) =>
  NextResponse.json(data, { status });

export const err = (message: string, status = 400) =>
  NextResponse.json({ error: message }, { status });

export const unauthorized = () => err("Unauthorized", 401);
export const forbidden = () => err("Forbidden", 403);
export const notFound = () => err("Not found", 404);
