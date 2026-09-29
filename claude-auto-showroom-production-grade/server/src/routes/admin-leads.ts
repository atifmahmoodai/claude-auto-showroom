import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { todayIn } from "../config";
import { tx } from "../db";
import { badRequest, notFound, parse, requireUser } from "../http";
import { assignLead, getLead, insertLead, listLeads, moveLead, vehicleLabels } from "../repo/leads";
import { audit, listBranches, listSalespeople } from "../repo/org";
import { addDays } from "../../../shared/dates";
import { leadAssignSchema, leadStageSchema, staffLeadSchema } from "../../../shared/schemas";

const listSchema = z.object({
  days: z.coerce.number().int().min(0).max(3650).default(30),
  branch: z.string().max(64).default(""),
  source: z.string().max(64).default(""),
  q: z.string().max(200).default(""),
});

export async function adminLeadRoutes(app: FastifyInstance) {
  app.addHook("preHandler", requireUser());

  app.get("/leads", async (req) => {
    const f = parse(listSchema, req.query);
    const since = f.days ? `${addDays(todayIn(app.config.TIMEZONE), -(f.days - 1))}T00:00:00Z` : undefined;
    const leads = await listLeads(app.db, { since, branchId: f.branch || undefined, source: f.source || undefined, q: f.q });
    return { items: leads, vehicles: await vehicleLabels(app.db, leads.flatMap((l) => (l.vehicleId ? [l.vehicleId] : []))) };
  });

  app.post("/leads", async (req, reply) => {
    const input = parse(staffLeadSchema, req.body);
    if (!(await listBranches(app.db)).some((b) => b.id === input.branchId)) throw badRequest("Unknown branch.", { branchId: "Unknown branch" });
    if (input.salespersonId && !(await listSalespeople(app.db)).some((s) => s.id === input.salespersonId && s.active)) {
      throw badRequest("Unknown salesperson.", { salespersonId: "Unknown salesperson" });
    }
    const lead = await tx(app.db, async (c) => {
      const l = await insertLead(c, { id: `l-${randomUUID()}`, ...input, vehicleId: input.vehicleId || undefined }, req.session!.user.id);
      await audit(c, { userId: req.session!.user.id, action: "lead.create", entity: "lead", entityId: l.id, details: { source: l.source }, ip: req.ip });
      return l;
    });
    return reply.status(201).send(lead);
  });

  app.patch<{ Params: { id: string } }>("/leads/:id/stage", async (req) => {
    const { stage } = parse(leadStageSchema, req.body);
    return tx(app.db, async (c) => {
      const before = await getLead(c, req.params.id);
      const lead = await moveLead(c, req.params.id, stage, req.session!.user.id);
      if (!lead || !before) throw notFound("Lead not found");
      if (before.stage !== stage) {
        await audit(c, { userId: req.session!.user.id, action: "lead.stage", entity: "lead", entityId: lead.id, details: { from: before.stage, to: stage }, ip: req.ip });
      }
      return lead;
    });
  });

  app.patch<{ Params: { id: string } }>("/leads/:id/assign", async (req) => {
    const { salespersonId } = parse(leadAssignSchema, req.body);
    if (salespersonId) {
      const lead = await getLead(app.db, req.params.id);
      if (!lead) throw notFound("Lead not found");
      const person = (await listSalespeople(app.db)).find((s) => s.id === salespersonId);
      if (!person || !person.active) throw badRequest("Unknown salesperson.", { salespersonId: "Unknown salesperson" });
    }
    const lead = await assignLead(app.db, req.params.id, salespersonId);
    if (!lead) throw notFound("Lead not found");
    await audit(app.db, { userId: req.session!.user.id, action: "lead.assign", entity: "lead", entityId: lead.id, details: { salespersonId }, ip: req.ip });
    return lead;
  });
}
