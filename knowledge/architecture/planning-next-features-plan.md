# Próximo ciclo: planejamento, fechamento e faturas

Data: 2026-11-06.
Estado: plano de implementação; nenhuma etapa abaixo está implementada por este documento.
Escopo: as cinco melhorias discutidas após o ciclo de metas, assinaturas, alertas, revisão assistida e compartilhamento.

## Direção do produto

O planejamento mensal continua sendo a tela principal para organizar o dinheiro. Expandir o que existe, mantendo totais previstos, realizados e disponíveis visíveis nos grupos abertos e fechados. Calendário e fechamento entram como ações e visões auxiliares; não recriar a divisão obrigatória entre “Orçamento” e “Vencimentos” que dificultou o uso anteriormente.

Entrega pretendida:

1. Enxergar parcelas e assinaturas comprometendo os próximos meses.
2. Consultar receitas, contas e faturas em um calendário com ações contextuais.
3. Revisar e fechar o mês com números confiáveis, sem inventar saldos nem travar correções.
4. Importar faturas de cartão com prévia, rastreabilidade e controle de duplicidade.
5. Distribuir a intenção mensal de poupar entre metas e acompanhar suas alocações efetivas.

Não incluir neste ciclo: integração bancária automática, execução de pagamentos bancários, cobrança SaaS, OCR genérico, recomendações de investimento ou notificações por e-mail/push.

## Base existente e lacunas

| Área | Já existe | Trabalho novo |
| --- | --- | --- |
| Cartões | Compras parceladas, faturas, créditos, pagamentos, assinaturas e seleção mensal no orçamento | Consulta de vários meses, composição da previsão e séries parcialmente observadas na importação |
| Planejamento | Orçamento por categoria, contribuição mensal global e seleção de faturas por mês | Distribuição por meta, exposição a meses futuros e revisão/fechamento |
| Compromissos | Recorrências, pendências, datas, vínculo a lançamentos e projeção por conta | Calendário unificado e ações preservando o contexto |
| Metas | Alocar/liberar saldo existente, histórico, desfazer, prazo e prioridade | Data financeira da alocação e intenção por meta/mês |
| Importação | Prévia, revisão, confirmação idempotente e evidências de extratos de contas/benefícios | Fluxo específico de faturas; o importador de conta não é um importador de cartão |
| Histórico | Competência de benefícios, posições históricas e cobertura parcial | Fechamentos versionados com composição e detecção de alterações posteriores |
| Compartilhamento | Ator separado do proprietário, papéis e RLS | Aplicar a mesma matriz aos recursos novos e validar concorrência em PostgreSQL |

Referências principais: `PlanningService`, `CommitmentsService`, `CardsService.planningBills`, `GoalsService`, `periodBudget`, os contratos em `api/src/core/integration` e [o ciclo anterior](features-cycle-2026-11-06.md).

## Regras financeiras comuns

- Valores monetários em centavos inteiros; intervalos de consulta usam início inclusivo e fim exclusivo. Datas financeiras são datas locais; horário de auditoria é independente.
- Saldo trazido não é receita nova. Reserva/investimento não vira despesa por mudar a localização ou a destinação do dinheiro.
- Créditos de benefícios configurados para o mês seguinte entram na competência desse mês. A sobra anterior continua disponível; não deslocar o saldo inteiro. Não misturar benefício com dinheiro livre para pagar cartão ou financiar metas.
- Compra no cartão, fatura e pagamento são relações diferentes. A análise de consumo pode mostrar a compra por categoria; o orçamento de caixa considera o pagamento da fatura selecionada. Cada visão mantém sua política explícita e não soma os dois eventos como despesas da mesma visão.
- Assinatura prevista não é compra confirmada. Quando a compra é confirmada ou vinculada, substitui a previsão correspondente.
- Pagamento parcial reduz a pendência; crédito, estorno e pagamento excedente seguem o motor de faturas existente. Não limitar todos os cálculos a `total - pagamentos` se há créditos a transportar.
- Nenhuma previsão deve criar automaticamente lançamento, movimentação de reserva, compra ou pagamento.
- Conta pagadora do cartão continua opcional. A vinculação da fatura em Movimentações permanece disponível pela seleção de cartão/fatura. Só exigir uma conta de origem ao registrar um pagamento que ainda não existe.
- Dados ausentes permanecem desconhecidos. Não substituir saldo sem cobertura por zero, nem apresentar previsão como dívida confirmada.

## Etapa 0 — Validar a base antes de ampliar o ciclo

Trabalho:

- Executar os cenários atuais de navegador e os novos fluxos em ambiente com servidor local e Chromium disponíveis; registrar execução real em desktop e mobile.
- Validar em PostgreSQL com conexões independentes a escrita concorrente, revogação de membro, leitor sem escrita e chamadas repetidas de confirmação.
- Conferir ciclo de cartão completo: compra, parcelas, assinatura prevista, confirmação, pagamento parcial, crédito, desfazer e reflexo no orçamento.
- Registrar os cálculos usados por cada visão para impedir divergência entre endpoints novos e existentes.

Aceite: regressões materiais resolvidas; testes financeiros e de permissão passam; limitações de ambiente ficam documentadas sem serem confundidas com aprovação.

Esta etapa não reativa CI/CD automático. A execução pode ser local ou manual.

## Etapa 1 — Parcelamentos futuros no planejamento

### Experiência

Adicionar “Próximos meses” ao planejamento, com horizonte inicial de 6 meses e opção de 12. Desktop usa tabela compacta; mobile usa lista por mês, sem rolagem horizontal obrigatória.

Cada mês mostra:

- Parcelas já registradas nas faturas.
- Assinaturas ainda previstas, identificadas como estimativa.
- Créditos e valores pagos, quando aplicáveis.
- Total pendente já registrado e total adicional previsto.
- Diferença para o valor manual do orçamento, caso exista.

Expandir um mês mostra os cartões e a composição. Acessar uma fatura preserva o mês e permite voltar à mesma consulta. Alterar o horizonte não altera o planejamento salvo. Cartões com dívida continuam visíveis mesmo arquivados; arquivar interrompe apenas novas previsões aplicáveis.

### Implementação

- Extrair o cálculo compartilhado das faturas de `CardsService` e adicionar um contrato de leitura por intervalo em `core/integration`.
- Calcular os 6/12 meses em lote a partir de um único carregamento do estado, evitando chamar `planningBills` repetidamente com releitura de todo o histórico.
- Retornar composição por origem, cobertura e separação entre registrado e estimado. Considerar o calendário de fechamento/vencimento e a regra de distribuição exata das parcelas.
- Reaproveitar as seleções e ajustes manuais existentes em `monthly_plans.card_plans`. Não materializar planos mensais em consultas GET.
- Expor uma consulta de projeção de cartões, com mês inicial e horizonte limitado. Atualizar OpenAPI, tipos frontend e invalidação após compras, regras, estornos, pagamentos e desfazer.

### Aceite e testes

Compra de R$ 300 em 3 parcelas distribui R$ 100 em três faturas corretas. Compra de R$ 100 em 3 parcelas mantém soma exata de R$ 100. Uma assinatura de R$ 20 aparece uma vez: como previsão antes da confirmação e como cobrança registrada depois. Mudanças de ano, dias 29–31, encerramento de assinatura, créditos e pagamentos parciais não duplicam nem perdem valores. Previsões não alteram saldos ou patrimônio.

## Etapa 2 — Metas dentro do planejamento

Esta etapa corresponde à melhoria 5 e antecede o fechamento completo, para que o mês possa mostrar intenção e realização por meta.

### Experiência

Na criação/edição do planejamento, adicionar uma seção opcional “Quanto quero reservar”, distribuindo a intenção entre metas ativas. Preservar o valor global atual e permitir uma parcela “Ainda sem destino”. Nenhuma meta é obrigatória.

No orçamento, mostrar por meta: previsto para reservar, alocado líquido no mês e diferença. “Reservar agora” abre o fluxo existente de alocação, com escolha da conta e seu saldo livre. “Transferir dinheiro para uma conta de reserva” é uma ação distinta em Movimentações.

### Modelo e regras

- Manter `monthly_plans.contribution_minor` como intenção global. Acrescentar linhas por meta com valores planejados e a restrição `soma das linhas <= intenção global` quando preenchida. Se só as linhas forem preenchidas, o formulário pode propor sua soma como intenção global, antes de salvar.
- Planos antigos com intenção global continuam válidos e aparecem como “sem destino”, sem preenchimento artificial de metas.
- Adicionar `effective_date` às alocações, preservando `created_at` e ator como auditoria. Para registros existentes, derivar a data de criação em `America/Sao_Paulo` e registrar essa origem como migrada.
- Realizado por meta/mês = alocações positivas menos liberações com data financeira naquele mês. Pode ser negativo e não deve ser ocultado ou limitado a zero.
- Exibir “alocado às metas”, sem afirmar que esse valor representa nova poupança ou transferência bancária: pode ser destinação de saldo antigo.
- Desfazer gera evento compensatório com data financeira atual por padrão; uma correção em mês anterior deve ser explícita e pode tornar um fechamento anterior desatualizado.
- Para alocações retroativas, verificar cobertura histórica quando disponível, saldo livre atual e ausência de sobreposição com outras metas. Sem histórico suficiente, exigir tratar a referência ou usar a data atual; não simular cobertura.
- Reserva já destinada a uma meta não pode ser destinada novamente. Reduzir o saldo posteriormente preserva a alocação e sinaliza insuficiência.
- Metas arquivadas permanecem nas consultas dos meses em que tiveram plano ou movimentos.

### Implementação

Criar linhas mensais de metas com FKs de espaço/owner e unicidade por plano/meta. Ampliar o contrato de alocação, os resumos mensais e o backup. Reutilizar o serviço de metas para a confirmação; nenhum endpoint de planejamento deve escrever diretamente em alocações.

### Aceite e testes

Planejar R$ 500 para uma meta não move dinheiro. Alocar R$ 200 registra R$ 200 como realizado dessa intenção. Liberar R$ 50 no mesmo mês reduz o líquido para R$ 150. Liberar saldo antigo em outro mês pode resultar em realizado negativo nesse mês. Transferir os mesmos R$ 200 para uma reserva não soma mais R$ 200 ao realizado da meta. Confirmar duas vezes não duplica a alocação.

## Etapa 3 — Fechamento do mês

### Experiência

Adicionar “Revisar mês” às ações do planejamento. Uma revisão apresenta:

- Previsto versus realizado do orçamento e diferenças por grupo/categoria, incluindo faturas selecionadas.
- Saldo trazido e saldo final disponível, com dinheiro e benefícios separados.
- Intenção de reservar e alocação líquida às metas; transferências líquidas para reservas/investimentos em informação própria.
- Pendências de classificação, conciliação, faturas e compromissos, com links para corrigir.
- Cobertura do histórico e referências de saldo que precisam ser revistas.

O usuário pode registrar um fechamento com ressalvas conhecidas; não precisa ter todos os lançamentos conciliados. Um mês com saldo desconhecido continua mostrando essa incerteza no registro. Mês atual ou futuro oferece revisão parcial/prévia, sem afirmar que é um mês encerrado.

Após fechar, oferecer “Preparar próximo mês” usando a cópia existente de orçamento e as previsões atuais de cartão. Não transformar a sobra em receita nem copiar compras/pagamentos como novos lançamentos.

### Modelo e consistência

- Criar registro versionado de fechamento por espaço/mês, incluindo autor, data, versão do cálculo, composição dos totais, cobertura, ressalvas e impressão digital dos dados usados.
- Gerar cada revisão a partir de um snapshot consistente do banco. A confirmação deve verificar a versão/impressão digital da prévia, sem aceitar um resumo obsoleto silenciosamente.
- Estender o suporte transacional para iniciar o cálculo com o isolamento apropriado desde o início da transação; não tentar trocar isolamento após consultas já executadas.
- O fechamento é um registro de revisão, não um bloqueio contábil: lançamentos e correções continuam permitidos.
- Alterações posteriores tornam o fechamento “precisa revisar”. Detectar mudanças em orçamento, lançamentos, pagamentos, metas, referências de saldo e configurações que alteram a competência. Não depender só de `monthly_plans.version`.
- Comparar com fontes e revisões completas quando a leitura ocorrer, incluindo alterações históricas que afetem saldo trazido. Assinaturas futuras e novas versões do cálculo também devem ter política explícita de invalidação.
- Preservar o fechamento anterior; reabrir/refazer cria nova revisão auditável. Dono e editor podem registrar revisão; leitor apenas consulta.
- Uma revisão antiga mantém os números registrados na época, junto da indicação de alteração posterior. Não substituir o snapshot silenciosamente por números atuais.

### Aceite e testes

Fechar não altera saldos, categorias, dívidas ou alocações. Correção de um lançamento anterior marca a revisão como desatualizada quando afeta o mês. Repetição idempotente da confirmação não cria duas revisões. Uma prévia alterada por outro participante exige nova conferência. Saldo trazido parcial nunca vira zero. A virada do mês preserva sobras de benefícios e desloca somente entradas com competência futura.

## Etapa 4 — Calendário financeiro unificado

Esta etapa corresponde à melhoria 2. Reaproveitar a agenda existente e o cálculo por intervalo consolidado nas etapas anteriores.

### Experiência

Ação “Ver calendário” no planejamento. Desktop oferece grade mensal e lista; mobile começa em lista cronológica com agrupamento por dia. “Hoje”, próximo/anterior mês e filtros por conta, cartão, tipo e situação permanecem acessíveis.

Cada evento identifica origem e situação: recebimento, conta a pagar, fatura, assinatura estimada, concluído ou dispensado. Previsões não se parecem com pagamentos confirmados.

Ações contextuais:

- Conta/recebimento: registrar, vincular lançamento existente ou dispensar a ocorrência.
- Fatura: abrir detalhes, registrar pagamento ou vincular débito existente.
- Assinatura: conferir a previsão ou confirmar cobrança no cartão; isso não quita a fatura.

### Implementação e regras

- Criar um contrato de leitura de eventos com identidade estável composta por origem e ocorrência.
- Combinar compromissos e cartões sem recriar registros em tabelas paralelas.
- Ocorrências liquidadas aparecem uma vez com vínculo ao lançamento. O pagamento associado não se torna um segundo compromisso.
- Não gerar vencimentos a partir de uma linha genérica de orçamento, pois ela não tem necessariamente uma data nem uma obrigação financeira.
- Não somar assinatura individual ao total do dia quando ela já está incluída na previsão da fatura. Usá-la como detalhamento ou aplicar filtros mutuamente exclusivos para composição.
- Projeção por conta só atribui obrigações quando a conta é conhecida. Fatura sem conta pagadora fica “origem a definir”, sem reduzir uma conta escolhida arbitrariamente.
- Mostrar quantidade de dias/eventos e informar limites/paginação; totalizadores não devem ser calculados apenas sobre a página visível.
- Ações chamam os serviços existentes, com controle de versão, idempotência e autorização.

### Aceite e testes

Pagar parcialmente uma fatura atualiza a pendência do mesmo evento. Vincular uma movimentação existente não cria outra. Fechar o modal retorna ao mesmo dia, filtros e posição da lista. Leitor pode navegar e ver detalhes, sem ações de alteração. Todos os fluxos principais funcionam em 320, 390, 768 e 1440 px, com teclado e sem rolagem horizontal obrigatória.

## Etapa 5 — Importação de faturas de cartão

Esta etapa corresponde à melhoria 4 e é a maior ampliação de domínio do ciclo.

### Primeira entrega e formatos

Começar com CSV de colunas mapeáveis e um arquivo modelo documentado: data, descrição, valor cobrado, natureza da linha, parcela atual/total e identificador da origem, quando disponíveis. O usuário seleciona cartão e mês da fatura, confere fechamento/vencimento e informa se o arquivo representa fatura completa ou parcial.

Suporte a PDF específico só entra depois de validar amostras representativas do emissor. Nome do cartão ou instituição, isoladamente, não garante suporte a um layout. OCR e PDF genérico ficam fora da primeira entrega. Limitar tamanho, quantidade de linhas e duração do processamento.

### Fluxo

1. Selecionar cartão/fatura e enviar arquivo.
2. Identificar ou mapear colunas e naturezas das linhas.
3. Mostrar prévia com compras, parcelas, tarifas/juros, estornos/créditos, pagamentos e saldos anteriores separados.
4. Sugerir duplicidades, associação a compras existentes e correspondência com assinaturas.
5. Resolver linhas ambíguas e revisar totais, cobertura e diferenças.
6. Confirmar o lote atomicamente, com idempotência e rastreabilidade.
7. Permitir desfazer o lote com análise de dependências posteriores e preservação de operações que já existiam antes dele.

### Cuidados com parcelas e saldos

- O valor da linha “parcela 3/10” costuma ser o valor cobrado nessa fatura, não o valor total da compra. Não multiplicar esse valor e registrar uma compra inteira automaticamente.
- Evoluir o domínio para distinguir compra completa conhecida de série de parcelas parcialmente observada. Preservar número da parcela, total conhecido, valor efetivamente observado e origem.
- Não criar parcelas passadas ou dívida de meses anteriores com base apenas em uma linha observada. Parcelas futuras inferidas ficam como previsão explicitamente revisada, até serem confirmadas por fonte ou escolha do usuário.
- Importações sobrepostas complementam evidências da mesma parcela, sem duplicar a série ou a fatura. Data, descrição e valor iguais podem representar duas compras legítimas; correspondências ambíguas exigem escolha.
- “Total da fatura”, “saldo anterior” e “pagamento mínimo” não são compras adicionais. Uma fatura anterior cadastrada manualmente não pode permanecer somada às mesmas compras importadas sem reconciliação explícita.
- Tarifa ou juros confirmados precisam de natureza própria, e não devem virar compra parcelada por inferência.
- Pagamento informado pela fatura não autoriza criar débito em uma conta bancária arbitrária. Vincular a um pagamento existente ou manter informação de origem pendente de revisão, sem fabricar o saldo bancário.
- Créditos/estornos podem não apontar uma compra específica: conservar a evidência e oferecer associação, sem inventar referência.
- Fatura completa pode validar os totais informados. Importação parcial tem cobertura parcial e não afirma que toda a fatura foi reconciliada.
- Desfazer não remove compras manuais, pagamentos ou vínculos preexistentes ao lote. Dependências novas precisam de revisão; evitar exclusão em cascata destrutiva.

### Implementação

Introduzir lote e linhas de importação de cartão separados dos extratos de conta, reutilizando infraestrutura de prévia, hash, validação e auditoria por contratos públicos. Importação pode permanecer no módulo `imports`, mas a confirmação de efeitos financeiros pertence ao serviço de cartões. Não importar repositórios privados entre módulos.

Adicionar evidências de compra/parcela, associação de linha à origem, controle de revisão e suporte ao backup das novas representações. Integrar com categorias, regras e assinaturas existentes, preservando escolhas manuais e categorias padrão das contas apenas onde fizer sentido; um cartão não deve herdar automaticamente a categoria da eventual conta pagadora.

### Aceite e testes

Mesmo arquivo não duplica efeitos. Arquivos sobrepostos preservam duas compras legítimas idênticas e reconhecem uma mesma parcela com identificador confiável. Uma parcela intermediária não cria dívida retroativa. Assinatura prevista é substituída pela cobrança importada correspondente após confirmação. Totais de uma fatura completa fecham ou explicam a diferença. Desfazer um lote preserva os dados anteriores e acusa dependências posteriores. Leituras e alterações são isoladas por espaço e papel.

## Contratos, migrations e compatibilidade

As estruturas abaixo são propostas, a detalhar em cada etapa antes de escrever as migrations. Não reservar números de migration antecipadamente, pois outras alterações podem ser aplicadas antes.

| Estrutura | Persistência proposta |
| --- | --- |
| Projeção futura | Consulta derivada; sem gravar meses ou dívidas em GET |
| Planejamento de metas | Linhas por plano/meta; data financeira e origem da data nas alocações |
| Fechamento | Revisões imutáveis com snapshot, autor, versão do cálculo e referência da prévia |
| Calendário | Consulta derivada com IDs estáveis; ações sobre registros existentes |
| Importação de cartão | Lotes, linhas, evidências e séries/parcela observadas com vínculos explícitos |

- Todas as tabelas financeiras usam namespace do proprietário, `workspace_id`, FKs compostas, RLS e ator autenticado conforme a arquitetura atual.
- Dono/editor podem alterar finanças; leitor consulta. Gestão de membros e restauração de backup continuam exclusivas do proprietário.
- Backup deve evoluir além de v13 nas etapas que adicionarem persistência, com restauração dos formatos antigos e remapeamento das referências novas. Fechamentos restaurados preservam o snapshot e a autoria histórica como metadado, mas ficam sujeitos a nova validação; não fingir que seus IDs de origem ainda são válidos.
- Dados novos não devem tornar metas, categorias padrão ou assinaturas obrigatórias.
- Publicar em incrementos: primeiro migrations compatíveis, depois API/contratos, interface, validações e deploy. CI/CD automático permanece desativado até nova instrução.

## Validação e conclusão por incremento

- Testes unitários para calendário, divisão exata, composição e competências.
- Integração com todas as migrations, papel restrito, backup, idempotência e rollback de lote.
- PostgreSQL com conexões independentes para versões concorrentes, confirmações repetidas e revogação durante escrita.
- Playwright executado em navegador para os fluxos de cada entrega, em ambos os temas, mobile/desktop, teclado e estados de erro. Listagem de testes ou build não substitui execução.
- `npm run verify` e `npm run contracts:check` aprovados para a versão entregue.
- Migrations aplicadas antes do deploy e smoke test no ambiente publicado, incluindo leitura de dados já existentes.
- Documentação deve registrar o que foi implementado, limitações de formatos e evidências efetivamente executadas.

## Ordem recomendada de execução

1. Validar a base e consolidar os contratos de leitura financeira.
2. Entregar projeção de parcelas/assinaturas para os próximos meses.
3. Integrar intenção e alocação das metas ao planejamento.
4. Entregar revisão e fechamento do mês.
5. Unificar o calendário usando os cálculos já consolidados.
6. Entregar importação de faturas por CSV; adicionar layouts específicos de PDF em incrementos posteriores com amostras validadas.

Essa ordem entrega primeiro visibilidade de compromissos futuros e torna o fechamento completo com as metas. A importação vem depois para ampliar a entrada de dados sobre regras e cálculos já verificáveis.
