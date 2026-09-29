-- Core schema. Money is whole currency units (the business quotes car prices without cents).

CREATE TABLE branches (
  id             text PRIMARY KEY,
  name           text NOT NULL,
  city           text NOT NULL,
  phone          text NOT NULL,
  address        text NOT NULL,
  monthly_target integer NOT NULL DEFAULT 0 CHECK (monthly_target >= 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id            text PRIMARY KEY,
  email         text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'manager', 'sales')),
  branch_id     text REFERENCES branches(id),
  password_hash text NOT NULL,
  active        boolean NOT NULL DEFAULT true,
  failed_logins integer NOT NULL DEFAULT 0,
  locked_until  timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- Only a hash of the session token is stored, so a database leak can't be replayed as logins.
CREATE TABLE sessions (
  id           text PRIMARY KEY,
  user_id      text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token   text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  ip           text,
  user_agent   text
);
CREATE INDEX sessions_user_idx ON sessions (user_id);
CREATE INDEX sessions_expiry_idx ON sessions (expires_at);

CREATE TABLE vehicles (
  id             text PRIMARY KEY,
  stock_no       text NOT NULL UNIQUE,
  vin            text NOT NULL DEFAULT '',
  make           text NOT NULL,
  model          text NOT NULL,
  trim           text NOT NULL DEFAULT '',
  year           integer NOT NULL CHECK (year BETWEEN 1950 AND 2100),
  body_type      text NOT NULL,
  fuel           text NOT NULL,
  transmission   text NOT NULL,
  condition      text NOT NULL,
  mileage        integer NOT NULL CHECK (mileage >= 0),
  color          text NOT NULL DEFAULT '',
  color_hex      text NOT NULL DEFAULT '#9ca3af',
  engine         text NOT NULL DEFAULT '',
  seats          integer NOT NULL CHECK (seats BETWEEN 1 AND 15),
  price          integer NOT NULL CHECK (price > 0),
  cost           integer NOT NULL CHECK (cost >= 0),
  branch_id      text NOT NULL REFERENCES branches(id),
  status         text NOT NULL CHECK (status IN ('Available', 'Reserved', 'Sold')),
  acquired_date  date NOT NULL,
  sold_date      date,
  sale_price     integer CHECK (sale_price > 0),
  salesperson_id text REFERENCES users(id),
  features       text[] NOT NULL DEFAULT '{}',
  description    text NOT NULL DEFAULT '',
  featured       boolean NOT NULL DEFAULT false,
  image_url      text NOT NULL DEFAULT '',
  version        integer NOT NULL DEFAULT 1,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sold_has_sale CHECK (status <> 'Sold' OR (sold_date IS NOT NULL AND sale_price IS NOT NULL AND salesperson_id IS NOT NULL)),
  CONSTRAINT sold_after_acquired CHECK (sold_date IS NULL OR sold_date >= acquired_date)
);
CREATE INDEX vehicles_status_idx ON vehicles (status, branch_id);
CREATE INDEX vehicles_sold_idx ON vehicles (sold_date) WHERE status = 'Sold';
-- A VIN can only be in stock once at a time (a car sold and bought back again is a new row).
CREATE UNIQUE INDEX vehicles_vin_in_stock ON vehicles (vin) WHERE vin <> '' AND status <> 'Sold';

CREATE TABLE leads (
  id                     text PRIMARY KEY,
  created_at             timestamptz NOT NULL DEFAULT now(),
  name                   text NOT NULL,
  phone                  text NOT NULL DEFAULT '',
  email                  text NOT NULL DEFAULT '',
  message                text NOT NULL DEFAULT '',
  type                   text NOT NULL CHECK (type IN ('Enquiry', 'Test Drive', 'Finance')),
  source                 text NOT NULL,
  stage                  text NOT NULL CHECK (stage IN ('New', 'Contacted', 'Test Drive', 'Negotiation', 'Won', 'Lost')),
  branch_id              text NOT NULL REFERENCES branches(id),
  vehicle_id             text REFERENCES vehicles(id) ON DELETE SET NULL,
  salesperson_id         text REFERENCES users(id),
  first_response_minutes integer CHECK (first_response_minutes >= 0),
  preferred_date         date
);
CREATE INDEX leads_created_idx ON leads (created_at DESC);
CREATE INDEX leads_stage_idx ON leads (stage);

CREATE TABLE lead_stage_events (
  id      bigserial PRIMARY KEY,
  lead_id text NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  stage   text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now(),
  user_id text REFERENCES users(id)
);
CREATE INDEX lead_stage_events_lead_idx ON lead_stage_events (lead_id, at);

CREATE TABLE settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE audit_log (
  id        bigserial PRIMARY KEY,
  at        timestamptz NOT NULL DEFAULT now(),
  user_id   text REFERENCES users(id) ON DELETE SET NULL,
  action    text NOT NULL,
  entity    text NOT NULL,
  entity_id text,
  details   jsonb NOT NULL DEFAULT '{}',
  ip        text
);
CREATE INDEX audit_log_at_idx ON audit_log (at DESC);
