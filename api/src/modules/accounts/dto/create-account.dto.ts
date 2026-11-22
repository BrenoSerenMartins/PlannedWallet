import { IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { UpdateAccountDto } from './update-account.dto.js';

export const SUPPORTED_ACCOUNT_INSTITUTIONS = ['mercado_pago', 'alelo', 'banco_do_brasil'] as const;

export class CreateAccountDto extends UpdateAccountDto {
  @ApiProperty({ enum: SUPPORTED_ACCOUNT_INSTITUTIONS })
  @IsIn(SUPPORTED_ACCOUNT_INSTITUTIONS, {
    message: 'Escolha uma instituição disponível: Mercado Pago, Alelo ou Banco do Brasil.',
  })
  declare institution: string;
}
