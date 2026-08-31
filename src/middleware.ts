import { NextResponse, type NextRequest } from "next/server";

/** Same-origin iframe previews: note/form PDF views + document file GETs */
function isEmbeddablePreviewRoute(pathname: string) {
  return (
    /\/api\/patients\/[^/]+\/(notes|forms)\/[^/]+\/pdf$/.test(pathname) ||
    /\/api\/patients\/[^/]+\/documents\/[^/]+$/.test(pathname)
  );
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();
  const embeddablePreview = isEmbeddablePreviewRoute(request.nextUrl.pathname);

  // HIPAA: security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", embeddablePreview ? "SAMEORIGIN" : "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  response.headers.set("Cross-Origin-Resource-Policy", "same-origin");
  const csp = embeddablePreview
    ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self' data:; connect-src 'self' https://www.youtube.com https://*.googlevideo.com; media-src 'self' https://*.googlevideo.com https://*.google.com blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'self';"
    : "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.youtube.com https://s.ytimg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://i.ytimg.com; font-src 'self' data:; connect-src 'self' https://www.youtube.com https://*.googlevideo.com; media-src 'self' https://*.googlevideo.com https://*.google.com blob:; frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com; frame-ancestors 'none';";
  response.headers.set("Content-Security-Policy", csp);

  if (process.env.NODE_ENV === "production" && request.nextUrl.protocol === "https:") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains; preload"
    );
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
