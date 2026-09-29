-- Read-only reporting views for Power BI / Excel / Metabase to connect to directly.
-- They carry no customer names, emails or phone numbers. Grant a reporting login
-- access to this schema only (see docs/POWERBI.md).

CREATE SCHEMA IF NOT EXISTS bi;

CREATE VIEW bi.dim_branch AS
SELECT id AS branch_id, name AS branch_name, city, monthly_target AS monthly_target_units FROM branches;

CREATE VIEW bi.dim_salesperson AS
SELECT id AS salesperson_id, name AS salesperson_name, branch_id, active FROM users WHERE branch_id IS NOT NULL;

CREATE VIEW bi.dim_vehicle AS
SELECT id AS vehicle_id, stock_no, vin, make, model, trim, year AS model_year, body_type, fuel, transmission,
       condition, mileage, color AS colour, price AS list_price, cost, branch_id, status, acquired_date, sold_date,
       (COALESCE(sold_date, CURRENT_DATE) - acquired_date) AS days_in_stock
FROM vehicles;

CREATE VIEW bi.fact_sales AS
SELECT id AS vehicle_id, sold_date, branch_id, salesperson_id, sale_price, cost,
       sale_price - cost AS gross_profit, (sold_date - acquired_date) AS days_to_sell
FROM vehicles WHERE status = 'Sold';

CREATE VIEW bi.fact_leads AS
SELECT l.id AS lead_id, (l.created_at AT TIME ZONE 'UTC')::date AS created_date, l.created_at, l.source, l.type AS lead_type,
       l.stage AS current_stage, l.branch_id, l.salesperson_id, l.vehicle_id, l.first_response_minutes,
       EXISTS (SELECT 1 FROM lead_stage_events e WHERE e.lead_id = l.id AND e.stage = 'Contacted') AS reached_contacted,
       EXISTS (SELECT 1 FROM lead_stage_events e WHERE e.lead_id = l.id AND e.stage = 'Test Drive') AS reached_test_drive,
       EXISTS (SELECT 1 FROM lead_stage_events e WHERE e.lead_id = l.id AND e.stage = 'Negotiation') AS reached_negotiation,
       l.stage = 'Won' AS is_won, l.stage = 'Lost' AS is_lost, l.stage NOT IN ('Won', 'Lost') AS is_open
FROM leads l;

CREATE VIEW bi.fact_lead_stage_history AS
SELECT lead_id, stage, at AS changed_at, (at AT TIME ZONE 'UTC')::date AS changed_date FROM lead_stage_events;
