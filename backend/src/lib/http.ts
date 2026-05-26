import { NextResponse } from 'next/server'

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json({ ok: true, data }, init)

export const fail = (status: number, message: string, extra?: Record<string, unknown>) =>
  NextResponse.json(
    {
      ok: false,
      error: {
        message,
        ...extra,
      },
    },
    { status },
  )

