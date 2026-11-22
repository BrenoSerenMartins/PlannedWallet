ALTER TABLE wallet.credit_cards ADD COLUMN artwork text
  CHECK (artwork IN ('mercado-pago-visa', 'inter-gold', 'inter-platinum', 'inter-prime', 'inter-win', 'inter', 'itau', 'c6-bank', 'c6-carbon', 'itau-azul-platinum'));
