import { auth } from "@/auth"

export function proxy(request: any) {
  return auth(request)
}

export default proxy

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
}
