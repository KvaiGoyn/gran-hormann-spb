import pages from '../../generated/pages.json';
export async function GET(request: Request) {
  const path = new URL(request.url).pathname.replace(/\/$/, '') || '/';
  const html = (pages as Record<string, string>)[path];
  return new Response(html || pages['/404'], { status: html ? 200 : 404, headers: {'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','Referrer-Policy':'strict-origin-when-cross-origin','Cache-Control':'no-cache'} });
}
