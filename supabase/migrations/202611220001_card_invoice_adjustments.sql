BEGIN;
ALTER TABLE wallet.card_bill_entries DROP CONSTRAINT card_bill_entries_kind_check;
ALTER TABLE wallet.card_bill_entries ADD CONSTRAINT card_bill_entries_kind_check
  CHECK (kind IN ('purchase', 'opening', 'refund', 'invoice_adjustment'));
COMMIT;
