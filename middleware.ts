import { type NextRequest } from "next/server"
import { createClient as createSupabaseClient } from "@/utils/supabase/middleware"

export async function middleware(request: NextRequest) {
  return await createSupabaseClient(request)
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
}
