import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { todayIn } from "../config";
import { tx } from "../db";
import { badRequest, notFound, parse } from "../http";
import { insertLead } from "../repo/leads";
import { audit, getSite, listBranches } from "../repo/org";
import { getVehicle, publicSummary, searchPublic, similarVehicles, toPublic } from "../repo/vehicles";
import { queryFromParams } from "../../../shared/inventory";
import { publicLeadSchema } from "../../../shared/schemas";

const pageSchema = z.object({
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
  limit: z.coerce.number().int().min(1).max(60).default(12),
});

export async function publicRoutes(app: FastifyInstance) {
  // Public, cacheable for a short time by browsers/CDNs.
  const cache = (seconds: number) => `public, max-age=${seconds}`;

  app.get("/site", async (_req, reply) => {
    const [site, branches] = await Promise.all([getSite(app.db), listBranches(app.db)]);
    reply.header("cache-control", cache(60));
    return { site, branches, today: todayIn(app.config.TIMEZONE) };
  });

  app.get("/summary", async (_req, reply) => {
    reply.header("cache-control", cache(30));
    return publicSummary(app.db);
  });

  app.get("/vehicles", async (req, reply) => {
    const raw = req.query as Record<string, string>;
    const { offset, limit } = parse(pageSchema, raw);
    const q = queryFromParams(new URLSearchParams(raw));
    reply.header("cache-control", cache(30));
    return searchPublic(app.db, q, limit, offset);
  });

  app.get<{ Params: { id: string } }>("/vehicles/:id", async (req, reply) => {
    const v = await getVehicle(app.db, req.params.id.slice(0, 64));
    if (!v) throw notFound("Vehicle not found");
    reply.header("cache-control", cache(30));
    return { vehicle: toPublic(v), similar: await similarVehicles(app.db, v) };
  });

  app.post(
    "/leads",
    // Stops form spam and floods of fake leads from one address.
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (req, reply) => {
      const input = parse(publicLeadSchema, req.body);
      // Honeypot filled in: pretend success so bots don't adapt, but store nothing.
      if (input.website) return reply.status(201).send({ ok: true });
      const today = todayIn(app.config.TIMEZONE);
      if (input.type === "Test Drive" && input.preferredDate! < today) throw badRequest("Choose today or a future date.", { preferredDate: "Choose today or a future date." });

      let branchId = input.branchId;
      let vehicleTitle: string | null = null;
      if (input.vehicleId) {
        const v = await getVehicle(app.db, input.vehicleId);
        if (!v) throw badRequest("That car is no longer listed.", { vehicleId: "Unknown vehicle" });
        // The car's own showroom handles the enquiry.
        branchId = v.branchId;
        vehicleTitle = `${v.year} ${v.make} ${v.model} ${v.trim} (${v.stockNo})`;
      }
      const branches = await listBranches(app.db);
      if (!branches.some((b) => b.id === branchId)) throw badRequest("Please choose a showroom.", { branchId: "Unknown showroom" });

      const lead = await tx(app.db, async (c) => {
        const l = await insertLead(
          c,
          {
            id: `l-${randomUUID()}`,
            name: input.name,
            email: input.email,
            phone: input.phone,
            message: input.message,
            type: input.type,
            source: "Website",
            branchId,
            vehicleId: input.vehicleId,
            preferredDate: input.type === "Test Drive" ? input.preferredDate : undefined,
          },
          null,
        );
        await audit(c, { userId: null, action: "lead.create", entity: "lead", entityId: l.id, details: { source: "Website", type: l.type }, ip: req.ip });
        return l;
      });
      // Don't make the visitor wait for the mail server.
      void app.mailer.newLead(lead, vehicleTitle);
      return reply.status(201).send({ ok: true });
    },
  );
}
