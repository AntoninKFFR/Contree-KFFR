/** Public connectivity probe. Never reads a session or private data. */
export function GET() {
  return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
}
