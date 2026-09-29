# Power BI with the production database

There are two ways to get data into Power BI:

1. **CSV export** (no setup): in the dealer admin, open **Data & Power BI** and download the star-schema tables. Then follow `powerbi/README.md` for relationships and DAX measures. This is good for a monthly pack.
2. **Live connection** (scheduled refresh): connect Power BI directly to the read-only `bi` schema in PostgreSQL. The reports refresh by themselves.

## Setting up the live connection

The `bi` schema (created by migration `002_bi_views.sql`) contains these views. They carry no customer names, emails or phone numbers:

| View | Grain |
|---|---|
| `bi.dim_branch` | one row per showroom |
| `bi.dim_salesperson` | one row per staff member attached to a branch |
| `bi.dim_vehicle` | one row per vehicle ever in stock |
| `bi.fact_sales` | one row per retail sale |
| `bi.fact_leads` | one row per lead, with funnel flags |
| `bi.fact_lead_stage_history` | one row per stage change |

Create a login that can read these views and nothing else. Run this once, as the database owner:

```sql
CREATE ROLE powerbi LOGIN PASSWORD 'a-long-random-password';
GRANT USAGE ON SCHEMA bi TO powerbi;
GRANT SELECT ON ALL TABLES IN SCHEMA bi TO powerbi;
-- The views read the base tables with the view owner's rights,
-- so powerbi needs no access to the public schema.
```

In Power BI Desktop:

1. **Connect:** choose Get data → PostgreSQL database. Server: your database host. Database: `showroom`. Data connectivity mode: *Import*.
2. **Load the views:** sign in as `powerbi` and select the six `bi.*` views.
3. **Build the model:** create relationships as in `powerbi/README.md`, add a date table, and paste the measures from `powerbi/measures.dax`. Column names use snake_case here, so adjust names in the measures where needed.
4. **Scheduled refresh:** publish, then configure refresh in the Power BI Service. A database on a private network needs an on-premises data gateway.

## Network access

- **Firewall:** don't expose PostgreSQL to the whole internet. Allow only the gateway's IP address, or use a private network or VPN.
- **Encryption:** require TLS (`sslmode=require`) on managed databases.
