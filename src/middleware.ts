
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { CookieOptions } from "@supabase/ssr";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({
    request: req,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("Nedostaju Supabase environment varijable.");
  }

  const s = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll();
        },

        setAll(items: CookieToSet[]) {
          items.forEach(({ name, value }) => {
            req.cookies.set(name, value);
          });

          res = NextResponse.next({
            request: req,
          });

          items.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await s.auth.getUser();

  if (req.nextUrl.pathname.startsWith("/admin")) {
    // Logged-out visitors can reach the email-link sign-in screen. A logged-in
    // non-admin still receives a real 404, and API routes repeat this check.
    if (!user) return res;

    const { data } = await s
      .from("admins")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data) {
      return new NextResponse(null, { status: 404 });
    }
  }

  return res;
}

export const config = {
  matcher: ["/admin/:path*"],
};
