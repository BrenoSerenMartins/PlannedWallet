ALTER TABLE wallet.alert_preferences ADD COLUMN budget_early boolean NOT NULL DEFAULT false;
ALTER TABLE wallet.alert_preferences ALTER COLUMN budget_percent SET DEFAULT 80;
