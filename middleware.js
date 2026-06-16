import { NextResponse } from 'next/server'

const MAINTENANCE_PAGE = '/maintenance.html'
const COOKIE_NAME = 'session'

export function middleware(req) {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true'
  if (!isMaintenance) return NextResponse.next()

  const { pathname } = req.nextUrl
  if (pathname === MAINTENANCE_PAGE) return NextResponse.next()

  // APIルートは503 JSONを返す（フロント側のfetchは失敗としてキャッチされる）
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.json(
      { error: 'メンテナンス中です。しばらくしてから再度お試しください' },
      { status: 503 }
    )
    clearSessionCookie(res)
    return res
  }

  // ページアクセスはメンテナンスページへ
  const res = NextResponse.rewrite(new URL(MAINTENANCE_PAGE, req.url))
  clearSessionCookie(res)
  return res
}

function clearSessionCookie(res) {
  // auth.js の clearSession と同じ属性で上書き → 確実に削除される
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
}

export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico|maintenance.html).*)',
}
