import { NextResponse } from "next/server";

/**
 * Error thrown when server-side CSRF configuration is invalid or missing in production.
 */
export class CsrfConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsrfConfigurationError";
  }
}

/**
 * Parsed canonical application origin components.
 */
export interface CanonicalOrigin {
  origin: string;
  protocol: string;
  hostname: string;
  port: string;
  effectivePort: string;
}

/**
 * Validates and normalizes the server's canonical application origin.
 *
 * SECURITY INVARIANTS:
 * 1. Production (NODE_ENV === "production"):
 *    - Strictly requires an explicitly configured server-side APP_URL.
 *    - Does NOT fall back to NEXT_PUBLIC_APP_URL.
 *    - Must use HTTP or HTTPS protocol.
 *    - Must NOT contain embedded username or password.
 *    - Must NOT contain path beyond the root slash.
 *    - Must NOT contain query string or fragment.
 *    - Fails closed by throwing CsrfConfigurationError if unconfigured or invalid.
 *    - NEVER silently falls back to trusting client-supplied Host or forwarded headers.
 * 2. Development / Test (NODE_ENV !== "production"):
 *    - Uses configured APP_URL first, falling back to NEXT_PUBLIC_APP_URL if provided.
 *    - Safely defaults to "http://localhost:3000" if neither is configured.
 * 3. Client headers (X-Forwarded-Host, X-Forwarded-Proto) are NEVER trusted
 *    to establish the expected canonical application origin.
 *
 * @returns Parsed canonical origin components.
 * @throws CsrfConfigurationError on missing or invalid configuration in production.
 */
export function getCanonicalOrigin(): CanonicalOrigin {
  const isProduction = process.env.NODE_ENV === "production";
  const rawAppUrl = isProduction
    ? process.env.APP_URL
    : process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL;

  let urlToParse: string;

  if (rawAppUrl && typeof rawAppUrl === "string" && rawAppUrl.trim().length > 0) {
    urlToParse = rawAppUrl.trim();
  } else {
    if (isProduction) {
      throw new CsrfConfigurationError(
        "CRITICAL: Production deployment requires an explicitly configured server-side APP_URL."
      );
    }
    urlToParse = "http://localhost:3000";
  }

  let parsed: URL;
  try {
    parsed = new URL(urlToParse);
  } catch {
    throw new CsrfConfigurationError(
      `CRITICAL: Canonical application URL '${urlToParse}' is not a syntactically valid URL.`
    );
  }

  // Protocol must be strictly http: or https:
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new CsrfConfigurationError(
      `CRITICAL: Canonical application URL protocol must be 'http:' or 'https:', got '${parsed.protocol}'.`
    );
  }

  // Must not contain credentials
  if (parsed.username || parsed.password) {
    throw new CsrfConfigurationError(
      "CRITICAL: Canonical application URL must not contain embedded username or password credentials."
    );
  }

  // Must not contain unexpected path beyond the root slash
  if (parsed.pathname !== "" && parsed.pathname !== "/") {
    throw new CsrfConfigurationError(
      `CRITICAL: Canonical application URL must specify an origin root without subpaths, got pathname '${parsed.pathname}'.`
    );
  }

  // Must not contain search/query parameters
  if (parsed.search && parsed.search.length > 0) {
    throw new CsrfConfigurationError(
      "CRITICAL: Canonical application URL must not contain search or query parameters."
    );
  }

  // Must not contain hash fragments
  if (parsed.hash && parsed.hash.length > 0) {
    throw new CsrfConfigurationError(
      "CRITICAL: Canonical application URL must not contain hash fragments."
    );
  }

  const protocol = parsed.protocol.toLowerCase();
  const hostname = parsed.hostname.toLowerCase();
  const port = parsed.port;
  const effectivePort = port || (protocol === "https:" ? "443" : "80");
  const origin = `${protocol}//${hostname}${port ? `:${port}` : ""}`;

  return {
    origin,
    protocol,
    hostname,
    port,
    effectivePort,
  };
}

/**
 * Validates the candidate Origin or Referer of an incoming HTTP request against the canonical origin.
 *
 * RULES:
 * 1. Evaluates 'Origin' header first.
 * 2. If 'Origin' is absent, evaluates 'Referer' header (parsed to origin).
 * 3. If both are absent on a mutating request: fails closed (status: 403).
 * 4. Checks exact protocol, hostname, and effective-port equality.
 * 5. Rejects any malformed, external, prefix/suffix-spoofed, or mismatched origins.
 */
export function validateCsrfOrigin(request: Request):
  | { isValid: true; origin: string }
  | { isValid: false; status: 403; error: "CSRF_VIOLATION"; message: string } {
  const canonical = getCanonicalOrigin();

  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");

  let candidateUrlString: string | null = null;
  let sourceHeader: "Origin" | "Referer" = "Origin";

  if (originHeader && originHeader.trim().length > 0) {
    candidateUrlString = originHeader.trim();
    sourceHeader = "Origin";
  } else if (refererHeader && refererHeader.trim().length > 0) {
    candidateUrlString = refererHeader.trim();
    sourceHeader = "Referer";
  } else {
    return {
      isValid: false,
      status: 403,
      error: "CSRF_VIOLATION",
      message: "Cross-origin request rejected: Missing Origin and Referer headers.",
    };
  }

  let parsedCandidate: URL;
  try {
    parsedCandidate = new URL(candidateUrlString);
  } catch {
    return {
      isValid: false,
      status: 403,
      error: "CSRF_VIOLATION",
      message: `Cross-origin request rejected: Malformed ${sourceHeader} header.`,
    };
  }

  // Protocol must be http: or https:
  if (parsedCandidate.protocol !== "http:" && parsedCandidate.protocol !== "https:") {
    return {
      isValid: false,
      status: 403,
      error: "CSRF_VIOLATION",
      message: `Cross-origin request rejected: Invalid ${sourceHeader} protocol '${parsedCandidate.protocol}'.`,
    };
  }

  const candidateProtocol = parsedCandidate.protocol.toLowerCase();
  const candidateHostname = parsedCandidate.hostname.toLowerCase();
  const candidateEffectivePort =
    parsedCandidate.port || (candidateProtocol === "https:" ? "443" : "80");

  const isProtocolMatch = candidateProtocol === canonical.protocol;
  const isHostMatch = candidateHostname === canonical.hostname;
  const isPortMatch = candidateEffectivePort === canonical.effectivePort;

  if (!isProtocolMatch || !isHostMatch || !isPortMatch) {
    return {
      isValid: false,
      status: 403,
      error: "CSRF_VIOLATION",
      message: "Cross-origin request rejected: Origin does not match canonical application origin.",
    };
  }

  return {
    isValid: true,
    origin: parsedCandidate.origin,
  };
}

/**
 * Validates that an incoming state-changing request specifies a valid Content-Type.
 *
 * RULES:
 * 1. Must be 'application/json' (case-insensitive).
 * 2. Permitted charset parameters (e.g. 'application/json; charset=utf-8') are accepted.
 * 3. Form-encoded, multipart, text/plain, or unsupported content types are rejected with 415.
 * 4. If allowEmptyBody is true (e.g. for POST /api/auth/logout), omitted or empty Content-Type is accepted.
 */
export function validateContentType(
  request: Request,
  options?: { allowEmptyBody?: boolean }
):
  | { isValid: true }
  | { isValid: false; status: 415; error: "UNSUPPORTED_MEDIA_TYPE"; message: string } {
  const contentType = request.headers.get("content-type");

  if (!contentType || contentType.trim().length === 0) {
    if (options?.allowEmptyBody) {
      return { isValid: true };
    }
    return {
      isValid: false,
      status: 415,
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: "Missing Content-Type header. Expected application/json.",
    };
  }

  const parts = contentType.split(";");
  const mediaType = parts[0].trim().toLowerCase();

  if (mediaType !== "application/json") {
    return {
      isValid: false,
      status: 415,
      error: "UNSUPPORTED_MEDIA_TYPE",
      message: `Unsupported Content-Type: '${mediaType}'. Expected application/json.`,
    };
  }

  // Validate charset parameter if provided
  for (let i = 1; i < parts.length; i++) {
    const param = parts[i].trim().toLowerCase();
    if (param.startsWith("charset=")) {
      const charset = param.substring("charset=".length).replace(/['"]/g, "").trim();
      if (charset !== "utf-8" && charset !== "utf8" && charset !== "iso-8859-1") {
        return {
          isValid: false,
          status: 415,
          error: "UNSUPPORTED_MEDIA_TYPE",
          message: `Unsupported charset in Content-Type: '${charset}'. Expected utf-8.`,
        };
      }
    }
  }

  return { isValid: true };
}

/**
 * Authoritative Server-Side CSRF and Content-Type Route Guard.
 *
 * Enforces:
 * 1. Safe methods (GET, HEAD, OPTIONS) pass through unconditionally.
 * 2. Mutating methods (POST, PUT, PATCH, DELETE):
 *    - Validates Content-Type is application/json (or allows empty body if configured).
 *    - Validates Origin / Referer matches canonical application origin.
 *
 * @param request - Standard Web Request or NextRequest.
 * @param options - Optional configuration (e.g. allowEmptyBody for logout).
 * @returns NextResponse with 403, 415, or 500 status on violation, or null if valid.
 */
export function requireCsrf(
  request: Request,
  options?: { allowEmptyBody?: boolean }
): NextResponse | null {
  const method = request.method.toUpperCase();

  // 1. Safe HTTP methods exempt from CSRF checks
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return null;
  }

  // 2. Strict Content-Type enforcement
  const ctResult = validateContentType(request, options);
  if (!ctResult.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: ctResult.error,
        message: ctResult.message,
      },
      { status: ctResult.status }
    );
  }

  // 3. Strict Origin / Referer validation
  let originResult;
  try {
    originResult = validateCsrfOrigin(request);
  } catch (err) {
    if (err instanceof CsrfConfigurationError) {
      console.error("CRITICAL CSRF CONFIGURATION ERROR:", err.message);
      return NextResponse.json(
        {
          success: false,
          error: "SERVER_CONFIGURATION_ERROR",
          message: "Server security configuration error.",
        },
        { status: 500 }
      );
    }
    throw err;
  }

  if (!originResult.isValid) {
    return NextResponse.json(
      {
        success: false,
        error: originResult.error,
        message: originResult.message,
      },
      { status: originResult.status }
    );
  }

  return null;
}
