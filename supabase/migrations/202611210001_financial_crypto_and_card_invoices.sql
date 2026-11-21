BEGIN;
CREATE TABLE wallet.financial_data_keys (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  key_version integer NOT NULL CHECK (key_version > 0),
  wrapped_key jsonb NOT NULL CHECK (jsonb_typeof(wrapped_key)='object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  PRIMARY KEY(user_id,key_version)
);
ALTER TABLE wallet.financial_data_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.financial_data_keys FORCE ROW LEVEL SECURITY;
CREATE POLICY owner_financial_keys ON wallet.financial_data_keys TO plannedwallet_runtime
  USING(user_id=wallet.current_user_id()) WITH CHECK(user_id=wallet.current_user_id());
GRANT SELECT,INSERT,UPDATE ON wallet.financial_data_keys TO plannedwallet_runtime;

CREATE TABLE wallet.card_invoice_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL DEFAULT wallet.current_workspace_id(),
  card_id uuid NOT NULL,
  bill_month text NOT NULL CHECK(bill_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  source_name text NOT NULL CHECK(length(source_name) BETWEEN 1 AND 150),
  fingerprint text NOT NULL CHECK(length(fingerprint)=64),
  payload_ciphertext jsonb NOT NULL CHECK(jsonb_typeof(payload_ciphertext)='object'),
  status text NOT NULL DEFAULT 'review' CHECK(status IN ('review','confirmed','superseded')),
  version integer NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE(user_id,workspace_id,id),
  FOREIGN KEY(user_id,workspace_id) REFERENCES wallet.workspaces(user_id,id) ON DELETE CASCADE,
  FOREIGN KEY(user_id,workspace_id,card_id) REFERENCES wallet.credit_cards(user_id,workspace_id,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX card_invoice_import_dedupe ON wallet.card_invoice_imports(user_id,workspace_id,card_id,fingerprint);
CREATE INDEX card_invoice_import_cycle ON wallet.card_invoice_imports(user_id,workspace_id,card_id,bill_month,status);
ALTER TABLE wallet.card_invoice_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE wallet.card_invoice_imports FORCE ROW LEVEL SECURITY;
CREATE POLICY owned_card_invoice_imports ON wallet.card_invoice_imports TO plannedwallet_runtime
  USING(user_id=wallet.current_user_id() AND workspace_id=wallet.current_workspace_id())
  WITH CHECK(user_id=wallet.current_user_id() AND workspace_id=wallet.current_workspace_id());
GRANT SELECT,INSERT,UPDATE ON wallet.card_invoice_imports TO plannedwallet_runtime;
COMMIT;
