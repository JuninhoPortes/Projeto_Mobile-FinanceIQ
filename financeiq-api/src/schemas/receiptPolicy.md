# Política de extração fiscal — contrato v1

Esta etapa define módulos puros e não conecta aquisição, interface, endpoints ou serviços externos. O mock e o formulário atuais continuam usando seus contratos existentes.

## Entrada de interpretação

`ReceiptExtraction` é a saída candidata de um futuro interpretador, não o contrato de upload. `receiptExtractionSchema` descreve sua estrutura; `isReceiptExtraction` valida a estrutura em runtime sem coerção ou dependências. `validateReceiptExtraction` verifica as regras semânticas e produz um envelope compatível com `ReceiptAnalysisResult`. O envelope é criado pelo servidor: o interpretador não escolhe provider, status ou autorização.

Todos os campos são obrigatórios no contrato, mas seus valores podem ser nulos. `null` exige `certainty: missing`; valores presentes exigem uma das outras certezas. Textos presentes devem ser não vazios, com até 500 caracteres. A data identificada deve existir no calendário e usar YYYY-MM-DD.

## Documentos

- Aceitar somente NF-e, NFC-e, NFS-e ou comprovante **fiscal** (`fiscal_receipt`), com classificação `clear` e legibilidade `readable` ou `partial`.
- Recibos genéricos, extratos bancários, comprovantes PIX/cartão, boletos, orçamentos e pedidos sem natureza fiscal são `other`; não bastam estabelecimento e valor para aceitação.
- Classificação desconhecida ou não clara é inconclusiva. Documento ilegível não produz campos aplicáveis.
- Um arquivo com vários documentos é rejeitado nesta versão; não somar seus totais.
- A classificação visual não comprova autenticidade, autorização fiscal nem pagamento. O futuro prompt e as avaliações deverão verificar esta política com documentos rotulados.

## Valores e campos seguros

O total precisa estar explicitamente identificado no documento. Nunca usar subtotal, troco, parcela, soma inferida de itens ou valor inventado para preencher um total ausente.

Valores monetários usam centavos inteiros seguros, positivos e até `maxAmountCents`. O teto inicial de análise é 100.000.000 centavos (R$ 1 milhão), configurável no contexto; ele não altera limites ou comportamento de `Transaction`. Não arredondar nem converter strings monetárias. Só BRL com total `clear` é aplicado. Moeda ausente ou estrangeira mantém extração parcial, sem conversão cambial.

Nesta etapa, a política é conservadora: somente campos `clear` podem ser aplicados; `inferred` e `uncertain` são explicitados em `uncertainFields` e omitidos dos campos compatíveis. Ausências aparecem em `missingFields`. Essas listas são derivadas pelo validador, não confiadas ao interpretador.

Não inferir `income`/`outcome` pela natureza da nota: a perspectiva do usuário precisa estar estabelecida. A sugestão de categoria só é aplicada com tipo seguro e correspondência única por nome normalizado em categoria ativa do contexto. Não criar categoria nem escolher fallback. Na futura rota, o servidor deverá obter esse contexto para o UID autenticado; a validação de ownership não faz parte desta etapa sem autenticação.

Uma extração completa exige descrição, total, tipo e categoria aplicáveis e documento legível. Demais extrações aceitas com ao menos um desses campos são parciais. Somente estabelecimento/data não produz resultado aplicável. Documentos rejeitados/inconclusivos geram `error` sem campos no envelope compatível.

`identifiedDate` é informativa: o patch atual a descarta. O resultado não contém `date`, `period_month`, `source` ou qualquer instrução de persistência. Não há salvamento automático.

## Limites da validação

Estrutura válida não implica coerência semântica; ambas não garantem correção factual. Revisão humana é obrigatória. As regras de arquivo, bytes, tamanho, páginas, autenticação, retenção e consumo serão implementadas em etapas posteriores. Recusa do provedor e resposta incompleta devem ser tratadas antes deste validador, sem fabricar uma extração.

O JSON de teste em `tests/fixtures/receiptExtraction.json` é inteiramente sintético. Nenhum dado fiscal real é necessário para estes testes.
