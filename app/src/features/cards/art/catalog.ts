import mercadoPagoMark from './mercado-pago-mark.webp';
import itauAzulPlatinum from './itau-azul-platinum.webp';
import c6Carbon from './c6-carbon.webp';
import c6Mark from './c6-bank-mark.webp';
import itauMark from './itau-mark.webp';
import interMark from './inter-mark.webp';
import mercadoPagoVisa from './mercado-pago-visa.webp';
import interGold from './inter-gold.webp';
import interPlatinum from './inter-platinum.webp';
import interPrime from './inter-prime.webp';
import interWin from './inter-win.webp';

export const cardArtwork: Record<CardArtworkId, { label: string; src: string }> = {
  inter: { label: 'Inter · modelo não identificado', src: interMark },
  itau: { label: 'Itaú · modelo não identificado', src: itauMark },
  'c6-bank': { label: 'C6 Bank · modelo não identificado', src: c6Mark },
  'mercado-pago-visa': { label: 'Mercado Pago Visa', src: mercadoPagoVisa },
  'inter-gold': { label: 'Inter Gold', src: interGold },
  'inter-platinum': { label: 'Inter Platinum', src: interPlatinum },
  'inter-prime': { label: 'Inter Prime', src: interPrime },
  'inter-win': { label: 'Inter Win', src: interWin },
  'itau-azul-platinum': { label: 'Itaú Azul Mastercard Platinum', src: itauAzulPlatinum },
  'c6-carbon': { label: 'C6 Carbon Mastercard Black', src: c6Carbon },
};

export type CardArtworkId =
  | 'mercado-pago-visa'
  | 'inter-gold'
  | 'inter-platinum'
  | 'inter-prime'
  | 'inter-win'
  | 'inter'
  | 'itau'
  | 'c6-bank'
  | 'itau-azul-platinum'
  | 'c6-carbon';

export type CardIssuer = 'mercado_pago' | 'inter' | 'itau' | 'c6';

export const invoiceIssuers: Record<CardIssuer, string> = {
  mercado_pago: 'Mercado Pago',
  inter: 'Inter',
  itau: 'Itaú',
  c6: 'C6 Bank',
};

export function suggestCardArtwork(
  name: string,
  detectedIssuer?: CardIssuer | null,
): CardArtworkId | '' {
  const words = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const issuer =
    detectedIssuer ??
    (/\b(mercado\s*pago|mp)\b/.test(words)
      ? 'mercado_pago'
      : /\binter\b/.test(words)
        ? 'inter'
        : /\b(itau|itaucard)\b/.test(words)
          ? 'itau'
          : /\bc6(?:\s*bank)?\b/.test(words)
            ? 'c6'
            : null);
  if (issuer === 'mercado_pago') return 'mercado-pago-visa';
  if (issuer === 'itau')
    return /\bazul\b/.test(words) && /\bplatinum\b/.test(words) ? 'itau-azul-platinum' : 'itau';
  if (issuer === 'c6') return /\bcarbon\b/.test(words) ? 'c6-carbon' : 'c6-bank';
  if (issuer === 'inter') {
    if (/\bgold\b/.test(words)) return 'inter-gold';
    if (/\bplatinum\b/.test(words)) return 'inter-platinum';
    if (/\bprime\b/.test(words)) return 'inter-prime';
    if (/\bwin\b/.test(words)) return 'inter-win';
    return 'inter';
  }
  return '';
}

export function cardArtworkIssuer(id: CardArtworkId | '' | null | undefined): CardIssuer | null {
  if (!id) return null;
  if (id === 'mercado-pago-visa') return 'mercado_pago';
  if (id === 'itau' || id === 'itau-azul-platinum') return 'itau';
  if (id === 'c6-bank' || id === 'c6-carbon') return 'c6';
  return 'inter';
}

export const issuerLogos: Readonly<Partial<Record<string, string>>> = {
  mercado_pago: mercadoPagoMark,
  inter: interMark,
  itau: itauMark,
  c6: c6Mark,
};

export const artworkIssuerLogos = Object.fromEntries(
  (Object.keys(cardArtwork) as CardArtworkId[]).map((id) => [
    id,
    issuerLogos[cardArtworkIssuer(id) ?? ''],
  ]),
);

export function cardArtworksForIssuer(issuer?: CardIssuer | null): CardArtworkId[] {
  return (Object.keys(cardArtwork) as CardArtworkId[]).filter(
    (id) => !issuer || cardArtworkIssuer(id) === issuer,
  );
}
