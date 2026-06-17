import { next } from '@vercel/functions'
import { jwtVerify } from 'jose'
import { parse } from 'cookie'

const COOKIE_NAME = 'session'
const BYPASS_COOKIE_NAME = 'maint_bypass'
const secret = new TextEncoder().encode(process.env.JWT_SECRET)
const ALLOWED_MEMBER_ID = 17

const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>メンテナンス中</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;
    background:#F7F4EE;color:#3A352E;}
  .box{text-align:center;padding:32px}
  h1{font-size:18px;margin-bottom:8px}
  p{font-size:13px;color:#6B6460}
</style>
</head>
<body>
  <div class="box">
    <h1>ただいまメンテナンス中です</h1>
    <p>しばらくしてから再度アクセスしてください。</p>
  </div>
</body>
</html>`

/** ログイン済みセッションがID:17本人か判定 */
async function isAllowedSession(request) {
  const cookies = parse(request.headers.get('cookie') || '')
  const token = cookies[COOKIE_NAME]
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, secret)
    return payload.memberId === ALLOWED_MEMBER_ID
  } catch {
    return false
  }
}

/** バイパスキー（URLのkeyパラメータ or 既に焼いたcookie）が有効か判定 */
function hasValidBypass(request, url) {
  const bypassKey = process.env.MAINTENANCE_BYPASS_KEY
  if (!bypassKey) return false
  if (url.searchParams.get('key') === bypassKey) return true
  const cookies = parse(request.headers.get('cookie') || '')
  return cookies[BYPASS_COOKIE_NAME] === bypassKey
}

export default async function middleware(request) {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true'
  if (!isMaintenance) return next()

  const url = new URL(request.url)
  const isApi = url.pathname.startsWith('/api/')

  const bypassKey = process.env.MAINTENANCE_BYPASS_KEY
  const cameFromQueryKey = !!bypassKey && url.searchParams.get('key') === bypassKey
  const allowed = (await isAllowedSession(request)) || hasValidBypass(request, url)

  if (allowed) {
    const res = next()
    // URLの?key=...で来た場合は、以後そのURLを共有しなくて済むようcookieに焼く
    if (cameFromQueryKey) {
      const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : ''
      res.headers.append(
        'Set-Cookie',
        `${BYPASS_COOKIE_NAME}=${bypassKey}; HttpOnly${secureFlag}; SameSite=Strict; Path=/; Max-Age=43200`
      )
    }
    return res
  }

  const res = isApi
    ? Response.json(
        { error: 'メンテナンス中です。しばらくしてから再度お試しください' },
        { status: 503 }
      )
    : new Response(MAINTENANCE_HTML, {
        status: 503,
        headers: { 'content-type': 'text/html; charset=utf-8' },
      })

  // 既存ログイン中のセッションも無効化（auth.jsのclearSessionと同じ属性で上書き）
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  res.headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly${secure}; SameSite=Strict; Path=/; Max-Age=0`
  )

  return res
}

export const config = {
  matcher: '/(.*)',
}