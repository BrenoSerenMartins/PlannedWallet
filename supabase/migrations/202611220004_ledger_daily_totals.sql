BEGIN;
LOCK TABLE wallet.transactions IN SHARE ROW EXCLUSIVE MODE;

CREATE TABLE wallet.ledger_daily_totals (
  user_id uuid NOT NULL,
  workspace_id uuid NOT NULL,
  transaction_date date NOT NULL,
  account_id uuid NOT NULL,
  transaction_type text NOT NULL,
  category_id uuid,
  amount_minor numeric NOT NULL,
  inflow_minor numeric NOT NULL,
  outflow_minor numeric NOT NULL,
  entry_count bigint NOT NULL CHECK (entry_count >= 0),
  UNIQUE NULLS NOT DISTINCT
    (user_id, workspace_id, transaction_date, account_id, transaction_type, category_id),
  FOREIGN KEY (user_id, workspace_id) REFERENCES wallet.workspaces(user_id, id) ON DELETE CASCADE
);

INSERT INTO wallet.ledger_daily_totals
SELECT user_id, workspace_id, transaction_date, account_id, transaction_type, category_id,
       sum(amount_minor), sum(greatest(amount_minor, 0)),
       sum(greatest(-amount_minor, 0)), count(*)
FROM wallet.transactions WHERE reversed_at IS NULL
GROUP BY user_id, workspace_id, transaction_date, account_id, transaction_type, category_id;

ALTER TABLE wallet.ledger_daily_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.ledger_daily_totals FORCE ROW LEVEL SECURITY;
CREATE POLICY ledger_daily_totals_workspace ON wallet.ledger_daily_totals TO plannedwallet_runtime
  USING (user_id=wallet.current_user_id() AND workspace_id=wallet.current_workspace_id())
  WITH CHECK (user_id=wallet.current_user_id() AND workspace_id=wallet.current_workspace_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON wallet.ledger_daily_totals TO plannedwallet_runtime;

CREATE FUNCTION wallet.maintain_ledger_daily_totals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF ROW(OLD.user_id, OLD.workspace_id, OLD.transaction_date, OLD.account_id,
           OLD.transaction_type, OLD.category_id, OLD.amount_minor, OLD.reversed_at)
       IS NOT DISTINCT FROM
       ROW(NEW.user_id, NEW.workspace_id, NEW.transaction_date, NEW.account_id,
           NEW.transaction_type, NEW.category_id, NEW.amount_minor, NEW.reversed_at) THEN
      RETURN NULL;
    END IF;
  END IF;

  IF TG_OP <> 'INSERT' AND OLD.reversed_at IS NULL THEN
    UPDATE wallet.ledger_daily_totals
    SET amount_minor = amount_minor - OLD.amount_minor,
        inflow_minor = inflow_minor - greatest(OLD.amount_minor, 0),
        outflow_minor = outflow_minor - greatest(-OLD.amount_minor, 0),
        entry_count = entry_count - 1
    WHERE user_id = OLD.user_id AND workspace_id = OLD.workspace_id
      AND transaction_date = OLD.transaction_date AND account_id = OLD.account_id
      AND transaction_type = OLD.transaction_type AND category_id IS NOT DISTINCT FROM OLD.category_id;

    DELETE FROM wallet.ledger_daily_totals
    WHERE user_id = OLD.user_id AND workspace_id = OLD.workspace_id
      AND transaction_date = OLD.transaction_date AND account_id = OLD.account_id
      AND transaction_type = OLD.transaction_type AND category_id IS NOT DISTINCT FROM OLD.category_id
      AND entry_count = 0;
  END IF;

  IF TG_OP <> 'DELETE' AND NEW.reversed_at IS NULL THEN
    INSERT INTO wallet.ledger_daily_totals AS daily
    VALUES (NEW.user_id, NEW.workspace_id, NEW.transaction_date, NEW.account_id,
            NEW.transaction_type, NEW.category_id, NEW.amount_minor,
            greatest(NEW.amount_minor, 0), greatest(-NEW.amount_minor, 0), 1)
    ON CONFLICT (user_id, workspace_id, transaction_date, account_id, transaction_type, category_id)
    DO UPDATE SET amount_minor = daily.amount_minor + EXCLUDED.amount_minor,
                  inflow_minor = daily.inflow_minor + EXCLUDED.inflow_minor,
                  outflow_minor = daily.outflow_minor + EXCLUDED.outflow_minor,
                  entry_count = daily.entry_count + 1;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER maintain_ledger_daily_totals
AFTER INSERT OR UPDATE OR DELETE ON wallet.transactions
FOR EACH ROW EXECUTE FUNCTION wallet.maintain_ledger_daily_totals();

CREATE INDEX transactions_active_workspace_date
  ON wallet.transactions(user_id, workspace_id, transaction_date DESC, id DESC)
  WHERE reversed_at IS NULL;
CREATE INDEX transactions_active_workspace_account_date
  ON wallet.transactions(user_id, workspace_id, account_id, transaction_date DESC, id DESC)
  WHERE reversed_at IS NULL;
CREATE INDEX transactions_active_workspace_type_date
  ON wallet.transactions(user_id, workspace_id, transaction_type, transaction_date DESC, id DESC)
  WHERE reversed_at IS NULL;
COMMIT;
