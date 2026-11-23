ALTER TABLE wallet.categories
  ADD COLUMN workspace_import_default boolean NOT NULL DEFAULT false,
  ADD CHECK (NOT workspace_import_default OR (type = 'expense' AND archived_at IS NULL));

CREATE UNIQUE INDEX categories_workspace_import_default
  ON wallet.categories (workspace_id)
  WHERE workspace_import_default;
