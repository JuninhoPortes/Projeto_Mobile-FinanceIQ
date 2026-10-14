# Adaptador OpenAI — histórico e contratos

**Estado atual, Etapa 6B.2:** o transporte SDK está implementado, com chamadas reais bloqueadas por padrão e testes exclusivamente locais. Consulte [transporte, configuração e limitações](receipts-openai-transport.md). As restrições de somente simulação descritas abaixo registram as etapas anteriores e foram substituídas pelos bloqueios explícitos documentados na 6B.2.

Atualização posterior: a [Etapa 5B.1](receipts-backend-simulation.md) conecta este adaptador à rota exclusivamente com transporte falso, sob ativação explícita em desenvolvimento. O transporte de rede real continua inexistente e o frontend ainda não foi alterado.

## Atualização da Etapa 6B.1 — contratos de origem

O resultado interno agora contém `origin: 'simulated' | 'real'`, correlacionado por tipos com `analysis.isSimulated` e `metrics.isSimulated`. `receiptAnalysisMetadata.ts` deriva os indicadores de uma origem interna explícita e verifica a consistência antes da resposta. Não modifica o esquema fiscal, os validadores ou os campos do contrato HTTP.

A origem é capturada na fábrica do adaptador por opção exclusiva de código do servidor, com padrão simulado para compatibilidade. A ponte passa explicitamente o modo validado do servidor. Corpo, query, documento e resposta do provedor não definem metadados confiáveis. O controller rejeita combinações inconsistentes com 503 e sem campos aplicáveis. Mensagens demonstrativas são acrescentadas somente à origem simulada; os contratos reais são exercitados com dados sintéticos, sem transporte real.

Representar `real` no contrato não o habilita. O middleware continua recusando `RECEIPT_ANALYSIS_MODE=real`, e o adaptador também bloqueia origem real ou transporte divergente antes de chamar `create`. `disabled` preserva 501 após upload válido; simulação continua restrita a desenvolvimento, autenticação/UID autorizado e controles locais. Não existe fallback de modo. Autenticação, quotas, timeout, cancelamento e descarte não foram alterados.

O frontend permanece inalterado e aceita somente o backend simulado. Transporte real, SDK, credenciais, revisão de prazos/custos e habilitação explícita ficam para uma etapa posterior autorizada. Nenhuma dependência ou configuração privada foi alterada. As seções abaixo registram a implementação original das etapas anteriores.

## Escopo e módulos

O adaptador é isolado: nenhum controller, rota ou serviço do frontend o importa. `POST /receipts/analyze` continua com o fluxo da Etapa 3 e retorna 501 depois de um upload válido autorizado. Não existe SDK OpenAI, transporte HTTP real, API key ou ativação por variável de ambiente nesta etapa.

- `src/types/receiptOpenAI.ts`: formato mínimo da requisição Responses, interface de transporte e resultado/telemetria da simulação.
- `src/services/receiptFiscalPrompt.ts`: política fiscal, defesa instrucional e lista mínima de categorias ativas.
- `src/services/receiptOpenAIAdapter.ts`: construção multimodal, timeout/cancelamento, parsing do envelope, validação e estimativa operacional.
- `tests/helpers/receiptResponsesMock.cjs`: double que registra cópias das requisições sintéticas e retorna respostas/erros programados. Não é provider para a rota.

`ReceiptResponsesTransport.create(request, { signal })` é o único ponto de transporte. `mode` deve ser `simulated`, validado em runtime; não há caminho de rede por padrão. Uma implementação real futura exige aprovação e mudança explícita desse bloqueio, mas pode reutilizar a construção, o parsing e a validação. Nenhuma dependência foi adicionada.

## Modelo e parâmetros

Padrão: `gpt-5.4-mini-2026-03-17`, snapshot documentado com imagens, Responses API e Structured Outputs. Foi escolhido para fixar o comportamento do primeiro perfil; a precisão fiscal ainda não foi medida. O esforço de raciocínio padrão documentado é `none`; omitimos `reasoning` e `temperature` para não enviar parâmetros desnecessários ou incompatíveis.

Perfis permitidos na configuração do servidor: esse snapshot, `gpt-5.4-mini` e `gpt-4.1-mini`. O alias 4.1 continua disponível como perfil comparativo; sua disponibilidade/depreciações devem ser verificadas antes de uso real. Não existe troca automática de modelo. Modelo desconhecido ou parâmetro inválido impede chamar o transporte. Modelo divergente informado na resposta também é rejeitado.

Variáveis futuras, documentadas apenas em `.env.example`:

| Variável | Padrão | Limite |
| --- | --- | --- |
| `RECEIPT_OPENAI_MODEL` | `gpt-5.4-mini-2026-03-17` | Perfis explícitos acima |
| `RECEIPT_OPENAI_TIMEOUT_MS` | 15000 | Inteiro positivo até 45000 |
| `RECEIPT_OPENAI_MAX_OUTPUT_TOKENS` | 2048 | Inteiro positivo até 4096 |

A fábrica captura a configuração do ambiente do servidor; modelo não é recebido do documento/contexto. Não lê chave real. Os valores não alteram quotas, upload, concorrência ou limites das etapas anteriores.

## Requisição

JPG/JPEG/PNG: `input_image`, `image_url` em data URL base64, `detail: high`. PDF: `input_file`, `file_data` em data URL base64 e nome fixo `document.pdf`. Não utiliza URL externa, Files API, histórico, ferramentas, background ou streaming.

Instruções ficam em `instructions`; categorias como JSON de dados em `input_text`; documento como conteúdo binário codificado na mensagem `user`. Solicita `text.format` com `type: json_schema`, `strict: true` e cópia do esquema existente `receiptExtractionSchema`. Usa `store: false`, `stream: false` e limite de saída. O esquema não é duplicado nem alterado.

O chamador futuro deve fornecer somente bytes já validados pela Etapa 3 e contexto de categorias pertencentes ao UID autenticado. O adaptador rejeita referências URI/URL, formato desconhecido, buffer vazio ou acima de 10 MiB, mas **não substitui** validação de integridade, dimensões ou páginas. Esta etapa não consulta Firestore para obter categorias.

## Resposta e segurança dos campos

1. Resposta do transporte permanece `unknown`.
2. Examina status externo, recusa, resposta incompleta e formato das mensagens. Aceita exatamente uma mensagem completa com um texto JSON de até 64 KiB; ferramentas são rejeitadas, sem execução. Itens de raciocínio podem ser ignorados, sem registro.
3. `JSON.parse`, sem tentar reparar JSON ou extrair fragmentos de texto livre.
4. `isReceiptExtraction` valida a estrutura e propriedades permitidas.
5. `validateReceiptExtraction` aplica as regras semânticas existentes, incluindo centavos, moeda, datas, certeza e categorias.
6. Retorna somente análise segura, assessment validado e métricas. Nunca retorna resposta bruta.

Resultados externos: `success`, `partial`, `rejected`, `inconclusive`, `error` ou `cancelled`. O envelope compatível em `analysis` é explicitamente `isSimulated: true`, com aviso de simulação. Rejeição, inconclusão ou erro não fornecem campos aplicáveis. Legibilidade parcial nunca é promovida a sucesso. O resultado não possui nenhuma ação de persistência.

O contrato existente já recebe `valueCents`. A camada confiável valida que sejam centavos inteiros seguros, positivos e dentro do teto, sem coerção, arredondamento ou multiplicação de floats; só depois converte centavos para o `amount` compatível. Não pode comprovar que o modelo leu corretamente a unidade ou o total: isso depende de avaliação factual e revisão humana. Valores inferidos/incertos e moeda desconhecida/estrangeira não preenchem o valor.

Ausências e incertezas são derivadas do contrato v1. Motivos de rejeição vêm do assessment existente, sem inventar novo esquema equivalente. A data identificada continua informativa e fica fora do patch financeiro existente. Nada altera `Transaction`, `source`, `date` ou `period_month`.

O prompt orienta rejeitar documentos pessoais/imagens aleatórias e outros documentos não fiscais; desconsiderar instruções no documento/categorias; não fabricar total; não confundir subtotal/troco/parcela/imposto; não inferir perspectiva do usuário ou autenticidade. Isso é uma defesa instrucional, não garantia contra prompt injection ou alucinação. Os testes com doubles verificam fronteiras, payload e rejeição de chamadas/JSON maliciosos; não medem comportamento de um modelo real.

## Falhas, timeout e descarte

Códigos incluem `MODEL_REFUSAL`, `INCOMPLETE_RESPONSE`, `INVALID_RESPONSE`, `INVALID_JSON`, `INVALID_STRUCTURE`, `INVALID_EXTRACTION`, `PROVIDER_AUTH`, `RATE_LIMIT`, `TIMEOUT`, `UNAVAILABLE`, `INVALID_REQUEST`, `INVALID_CONFIGURATION`, `UNEXPECTED_MODEL` e `CANCELLED`.

Uma tentativa, sem retries ou fallback. Timeout/cancelamento abortam o sinal e invalidam resultados tardios, mesmo se o double não respeitar abort. Timers/listeners e referências de instruções, contexto e base64 são removidos ao finalizar. O adaptador não altera o buffer do chamador; a responsabilidade de zerá-lo continua no proprietário.

**Atualização da Etapa 5A:** o middleware agora oferece um consumidor interno opcional, após validação e antes do descarte, mantendo a reserva até sua confirmação de término. A rota padrão não instala consumidor e o adaptador continua desconectado. Uma futura ponte deve assegurar também o encerramento do transporte: retornar do adaptador após timeout não prova que um transporte ignorando abort terminou. Consulte [ciclo de vida documental](receipts-document-lifecycle.md). Nenhuma chamada real foi habilitada.

Strings base64 e cópias internas não oferecem apagamento seguro em JavaScript. Não reter requests/respostas, nem usar documentos reais em doubles que gravam chamadas. `store: false` não equivale a Zero Data Retention do provedor. A ativação real exigirá reavaliar retenção, limites de custo, transporte, credenciais e infraestrutura distribuída.

## Métricas e custo ilustrativo

`onMetrics` recebe somente modelo configurado, indicador de simulação, status, duração e contagens de tokens/custo estimado. Sem UID, nome de arquivo, estabelecimento, CPF/CNPJ, prompt, documento, conteúdo de erro ou resposta bruta. Não há logger embutido. Falha do observador não altera a análise.

Preços de referência consultados em 14/10/2026, por milhão de tokens de entrada/cache/saída: 5.4 mini = US$ 0,75 / 0,075 / 4,50; 4.1 mini = US$ 0,40 / 0,10 / 1,60. Estimativa = entrada não cacheada × tarifa + entrada cacheada × tarifa + saída × tarifa. Tokens de raciocínio, se houver, já fazem parte da saída; não somar novamente. Tarifas devem ser revalidadas antes de ativação real.

`usage` ausente ou inválido gera métricas de tokens/custo nulas. Sem detalhe de cache, a estimativa assume toda entrada não cacheada, conservadoramente. Recusas/extrações inválidas ainda contabilizam usage válido recebido. Não há cobrança real nesta etapa, e a estimativa não representa orçamento ou fatura. Exemplo sintético: 3000 tokens de entrada, 1000 deles cacheados, e 500 de saída no perfil 5.4 mini = US$ 0,003825 ilustrativos.

## Validação

Na raiz: `node --test tests/*.test.cjs`. Backend: compilador TypeScript instalado com `--noEmit -p financeiq-api/tsconfig.json`. A suíte nova bloqueia rede e escrita em runtime e usa somente transporte falso; não exige credenciais. A regressão da Etapa 3 continua verificando HTTP 501 para imagens/PDFs válidos.

Referências oficiais: [Responses/Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses), [imagens](https://developers.openai.com/api/docs/guides/images-vision), [PDF inline](https://developers.openai.com/api/docs/guides/file-inputs), [GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini), [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) e [retenção](https://developers.openai.com/api/docs/guides/your-data).
