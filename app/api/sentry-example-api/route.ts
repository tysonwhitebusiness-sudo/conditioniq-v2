export const dynamic = "force-dynamic"

export function GET() {
  throw new Error("Sentry API test error - this is expected")
}
