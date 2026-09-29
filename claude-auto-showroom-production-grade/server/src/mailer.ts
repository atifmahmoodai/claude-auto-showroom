import type { FastifyBaseLogger } from "fastify";
import nodemailer from "nodemailer";
import type { Config } from "./config";
import type { Lead } from "../../shared/types";

export interface Mailer {
  newLead(lead: Lead, vehicleTitle: string | null): Promise<void>;
}

/** Emails staff about new website leads. Without SMTP settings it only logs, so leads are never lost (they're in the database). */
export function createMailer(config: Config, log: FastifyBaseLogger): Mailer {
  const transport = config.SMTP_URL ? nodemailer.createTransport(config.SMTP_URL) : null;
  return {
    async newLead(lead, vehicleTitle) {
      if (!transport || !config.LEAD_NOTIFY_EMAIL) {
        log.info({ leadId: lead.id }, "new lead (email notifications not configured)");
        return;
      }
      const link = new URL(`/admin/leads?q=${encodeURIComponent(lead.name)}`, config.PUBLIC_URL).toString();
      try {
        await transport.sendMail({
          from: config.MAIL_FROM,
          to: config.LEAD_NOTIFY_EMAIL,
          // Plain text only: customer-typed content never becomes HTML.
          subject: `New ${lead.type.toLowerCase()} from ${lead.name.slice(0, 60)}`,
          text: [
            `${lead.type} request from ${lead.name}`,
            vehicleTitle ? `Vehicle: ${vehicleTitle}` : null,
            lead.email ? `Email: ${lead.email}` : null,
            lead.phone ? `Phone: ${lead.phone}` : null,
            lead.preferredDate ? `Preferred date: ${lead.preferredDate}` : null,
            "",
            lead.message,
            "",
            `Open in the dealer admin: ${link}`,
          ]
            .filter((l) => l !== null)
            .join("\n"),
        });
      } catch (err) {
        log.error({ err, leadId: lead.id }, "lead notification email failed");
      }
    },
  };
}
