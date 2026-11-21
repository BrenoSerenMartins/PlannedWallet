import { Module } from '@nestjs/common';
import { CardsController } from './controllers/cards.controller.js';
import { CardsRepository } from './repositories/cards.repository.js';
import { CardsService } from './services/cards.service.js';
import { CardInvoiceImportsRepository } from './repositories/card-invoice-imports.repository.js';
import { CardInvoiceImportsService } from './services/card-invoice-imports.service.js';
@Module({
  controllers: [CardsController],
  providers: [
    CardsRepository,
    CardsService,
    CardInvoiceImportsRepository,
    CardInvoiceImportsService,
  ],
  exports: [CardsService],
})
export class CardsModule {}
export { CardsService };
