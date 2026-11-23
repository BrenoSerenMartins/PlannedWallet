import { expect, it } from 'vitest';
import { extractC6Statement } from '../parsers/c6/statement.parser.js';

it('maps C6 account CSV credit and debit amounts without inventing balances', async () => {
  const csv = Buffer.from(
    [
      'Extrato personalizado',
      '',
      'Agência: 1 / Conta: 1234',
      'Data Lançamento,Data Contábil,Título,Descrição,Entrada(R$),Saída(R$)',
      '11/11/2026,11/11/2026,Pix,Crédito,"10,25",',
      '12/11/2026,12/11/2026,Pix,Débito,,"3,10"',
    ].join('\n'),
  );
  const statement = await extractC6Statement(csv, 'c6.csv');
  expect(statement).toMatchObject({
    institution: 'c6',
    openingBalance: null,
    closingBalance: null,
  });
  expect(statement.items.map((item) => item.amount)).toEqual([1025, -310]);
});

it('maps the C6 OFX FITID and rejects other issuers', async () => {
  const source =
    '<OFX><ORG>Banco C6 S.A.<CURDEF>BRL<BANKACCTFROM><ACCTID>test</BANKACCTFROM><BANKTRANLIST><STMTTRN><DTPOSTED>20261111120000[-3:BRT]<TRNAMT>-42.1<FITID>test-1<MEMO>PIX</STMTTRN></BANKTRANLIST></OFX>';
  const statement = await extractC6Statement(Buffer.from(source), 'c6.ofx');
  expect(statement.items).toMatchObject([
    { amount: -4210, sourceOperationId: 'test-1', transactionDate: '2026-11-11' },
  ]);
  await expect(
    extractC6Statement(Buffer.from(source.replace('Banco C6 S.A.', 'Outro')), 'outro.ofx'),
  ).rejects.toThrow('Layout');
});
