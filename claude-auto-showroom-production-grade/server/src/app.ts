import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import type pg from "pg";
import type { Config } from "./config";
import { HttpError } from "./http";
import { createMailer, type Mailer } from "./mailer";
import { adminLeadRoutes } from "./routes/admin-leads";
import { adminReportRoutes } from "./routes/admin-reports";
import { adminSettingsRoutes } from "./routes/admin-settings";
import { adminVehicleRoutes } from "./routes/admin-vehicles";
import { authRoutes } from "./routes/auth";
import { healthRoutes } from "./routes/health";
import { publicRoutes } from "./routes/public";
import { seoRoutes } from "./routes/seo";
import { readSession, SESSION_COOKIE, type Session } from "./security/sessions";

declare module "fastify" {
  interface FastifyInstance {
    db: pg.Pool;
    config: Config;
    mailer: Mailer;
  }
  interface FastifyRequest {
    session: Session | null;
  }
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function buildApp(config: Config, db: pg.Pool, opts: { mailer?: Mailer } = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger:
      config.LOG_LEVEL === "silent"
        ? false
        : {
            level: config.LOG_LEVEL,
            // Never write credentials or session cookies to the logs.
            redact: ["req.headers.cookie", "req.headers.authorization", "req.headers['x-csrf-token']", "res.headers['set-cookie']"],
          },
    trustProxy: config.TRUST_PROXY,
    bodyLimit: 1024 * 1024,
    genReqId: (req) => (typeof req.headers["x-request-id"] === "string" && req.headers["x-request-id"].length <= 100 ? req.headers["x-request-id"] : randomUUID()),
    requestIdHeader: false,
  });

  app.decorate("db", db);
  app.decorate("config", config);
  app.decorate("mailer", opts.mailer ?? createMailer(config, app.log));
  app.decorateRequest("session", null);

  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "script-src": ["'self'"],
        // Charts set inline styles.
        "style-src": ["'self'", "'unsafe-inline'"],
        // Vehicle photos may be hosted on any https CDN.
        "img-src": ["'self'", "data:", "https:"],
        "connect-src": ["'self'"],
        "frame-ancestors": ["'none'"],
        "upgrade-insecure-requests": config.cookieSecure ? [] : null,
      },
    },
    hsts: config.cookieSecure ? { maxAge: 31536000, includeSubDomains: true } : false,
    crossOriginEmbedderPolicy: false,
  });
  await app.register(cookie);
  await app.register(rateLimit, {
    max: config.RATE_LIMIT_PER_MIN,
    timeWindow: "1 minute",
    allowList: (req) => req.url === "/healthz" || req.url === "/readyz",
  });
  await app.register(multipart, { limits: { fileSize: config.UPLOAD_MAX_MB * 1024 * 1024, files: 1, fields: 5 } });

  app.addHook("onRequest", async (req, reply) => {
    reply.header("x-request-id", req.id);
    if (!req.url.startsWith("/api/")) return;
    noCacheApi(reply);
    // Cross-site form posts and fetches are refused outright (defence in depth on top of SameSite cookies + CSRF token).
    if (UNSAFE.has(req.method)) {
      const origin = req.headers.origin;
      if (origin && origin !== new URL(config.PUBLIC_URL).origin) throw new HttpError(403, "Cross-origin request refused.", "bad_origin");
    }
    const token = req.cookies[SESSION_COOKIE];
    if (token) req.session = await readSession(db, token, config.SESSION_IDLE_HOURS);
    // Every state change by a signed-in user must carry the session's CSRF token.
    if (req.session && UNSAFE.has(req.method) && req.headers["x-csrf-token"] !== req.session.csrfToken) {
      throw new HttpError(403, "Your session token is missing or out of date. Reload the page and try again.", "csrf");
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) {
      return reply.status(err.status).send({ error: err.code, message: err.message, details: err.details });
    }
    const e = err as { statusCode?: number; code?: string; message: string };
    const pgCode = e.code;
    if (pgCode === "23505") return reply.status(409).send({ error: "conflict", message: "That record already exists (duplicate value)." });
    if (pgCode === "23503") return reply.status(400).send({ error: "validation", message: "A referenced record doesn't exist." });
    if (pgCode === "23514") return reply.status(400).send({ error: "validation", message: "The values break a data rule." });
    if (e.statusCode && e.statusCode < 500) {
      return reply.status(e.statusCode).send({ error: e.code ?? "bad_request", message: e.message });
    }
    req.log.error({ err }, "unhandled error");
    return reply.status(500).send({ error: "internal", message: "Something went wrong. Please try again." });
  });

  await app.register(healthRoutes);
  await app.register(seoRoutes);
  await app.register(publicRoutes, { prefix: "/api/public" });
  await app.register(authRoutes, { prefix: "/api/auth" });
  await app.register(adminVehicleRoutes, { prefix: "/api/admin" });
  await app.register(adminLeadRoutes, { prefix: "/api/admin" });
  await app.register(adminReportRoutes, { prefix: "/api/admin" });
  await app.register(adminSettingsRoutes, { prefix: "/api/admin" });

  const uploads = resolve(config.UPLOAD_DIR);
  mkdirSync(uploads, { recursive: true });
  await app.register(fastifyStatic, { root: uploads, prefix: "/uploads/", decorateReply: false, immutable: true, maxAge: "365d", index: false });

  const webDir = config.WEB_DIST ? resolve(config.WEB_DIST) : "";
  const web = webDir && existsSync(resolve(webDir, "index.html")) ? webDir : "";
  if (web) {
    await app.register(fastifyStatic, {
      root: web,
      prefix: "/",
      wildcard: false,
      index: false,
      // Hashed asset files never change; index.html must always be fresh.
      setHeaders: (reply, path) => reply.header("cache-control", path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache"),
    });
  }

  app.setNotFoundHandler((req, reply) => {
    const accepts = req.headers.accept ?? "";
    if (req.method === "GET" && web && !req.url.startsWith("/api/") && !req.url.startsWith("/uploads/") && accepts.includes("text/html")) {
      // Client-side routes (/inventory, /vehicle/…, /admin/…) all load the app shell.
      return reply.header("cache-control", "no-cache").sendFile("index.html", web);
    }
    return reply.status(404).send({ error: "not_found", message: "Not found" });
  });

  return app;
}

function noCacheApi(reply: { header: (k: string, v: string) => unknown }) {
  reply.header("cache-control", "no-store");
}
