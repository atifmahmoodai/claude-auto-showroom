import type { FastifyInstance } from "fastify";

const xml = (s: string) => s.replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`);

export async function seoRoutes(app: FastifyInstance) {
  app.get("/robots.txt", async (_req, reply) => {
    const base = app.config.PUBLIC_URL.replace(/\/$/, "");
    return reply.type("text/plain").send(`User-agent: *\nDisallow: /admin\nDisallow: /api/\nSitemap: ${base}/sitemap.xml\n`);
  });

  /** Lets search engines find every car in stock. */
  app.get("/sitemap.xml", async (_req, reply) => {
    const base = app.config.PUBLIC_URL.replace(/\/$/, "");
    const { rows } = await app.db.query<{ id: string; updated_at: Date }>("SELECT id, updated_at FROM vehicles WHERE status <> 'Sold' ORDER BY id");
    const urls = [
      `<url><loc>${xml(base)}/</loc></url>`,
      `<url><loc>${xml(base)}/inventory</loc></url>`,
      `<url><loc>${xml(base)}/contact</loc></url>`,
      ...rows.map((r) => `<url><loc>${xml(`${base}/vehicle/${r.id}`)}</loc><lastmod>${r.updated_at.toISOString().slice(0, 10)}</lastmod></url>`),
    ];
    return reply
      .type("application/xml")
      .header("cache-control", "public, max-age=3600")
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`);
  });
}
