import { Global, Module } from '@nestjs/common';
import { FinancialCryptoService } from './financial-crypto.js';

@Global()
@Module({ providers: [FinancialCryptoService], exports: [FinancialCryptoService] })
export class FinancialCryptoModule {}
