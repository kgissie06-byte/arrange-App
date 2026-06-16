import { next } from '@vercel/functions'

const COOKIE_NAME = 'session'

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

export default function middleware(request) {
  const isMaintenance = process.env.MAINTENANCE_MODE === 'true'
  if (!isMaintenance) return next()

  const url = new URL(request.url)
  const isApi = url.pathname.startsWith('/api/')

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