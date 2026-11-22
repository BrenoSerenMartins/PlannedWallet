import mercadoPago from './mercado-pago-mark.webp';
import inter from './inter-mark.webp';
import itau from './itau-mark.webp';
import c6 from './c6-bank-mark.webp';
import benefit from './benefit.svg';
import bank from './bank.svg';

export const issuerLogos: Readonly<Partial<Record<string, string>>> = {
  mercado_pago: mercadoPago,
  inter,
  itau,
  c6,
};

export function accountOptionIcons(accounts: { id: string; institution: string; type: string }[]) {
  return Object.fromEntries(
    accounts.map((account) => [
      account.id,
      issuerLogos[account.institution] ?? (account.type.startsWith('benefit_') ? benefit : bank),
    ]),
  );
}
