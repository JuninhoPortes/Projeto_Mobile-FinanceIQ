# Etapa 6B.3 — validação HTTP completa sem serviços externos

Atualização posterior: o [primeiro piloto real relatado](receipts-first-real-pilot.md#registro-posterior--primeiro-piloto-real-concluído) concluiu a integração com rejeição documental. A seção final deste documento explica o contrato e a revisão offline; os totais e pendências da entrega 6B.3 abaixo são históricos.

Base: `5a267a7`, branch `feat/leitura-notas-openai`. A revisão confirmou que a Etapa 6B.2 já conectou o transporte ao middleware e ao controller. Não foi necessário alterar código de produção, contratos, configurações, dependências ou frontend. Esta entrega acrescenta a suíte `tests/receiptAnalyzeRoute.test.cjs` e documenta a cobertura integrada.

## Fluxo exercitado

Cada caso envia uma requisição HTTP real à rota `POST /receipts/analyze`, em servidor Express vinculado somente a `127.0.0.1`, usando o router, middlewares e controller do backend:

```text
HTTP → autenticação Firebase com SDK falso → allowlist por UID → quotas
     → multipart → validação binária em processo real → escopo documental
     → adaptador → transporte da 6B.2 com cliente falso → validação fiscal
     → confirmação de término → descarte/liberação → controller → HTTP
```

O serviço `firebaseAdminService.ts` é carregado pelo mecanismo de testes existente com SDK/ambiente substituídos. Verificação de revogação, tratamento de erros, bloqueio de emulador, autenticação e autorização continuam executando o código original. Os rótulos dos tokens não são JWTs ou credenciais. Não há Firebase real, leitura de ADC ou mutação de `process.env`.

A fábrica `createOpenAIClient`, já existente, é injetada por código. Não há endpoint, parâmetro HTTP, configuração persistida ou bypass de autenticação para selecionar o cliente falso. A sentinela local `OFFLINE-CLIENT-ONLY` satisfaz apenas a presença de configuração no teste: não é uma chave e nunca é utilizada pelo SDK. A suíte bloqueia também o método de requisição do SDK real, independentemente da injeção. Perder a fábrica falsa causa falha do teste antes de qualquer envio.

## Isolamento e observação de recursos

- Fetch global, HTTPS, TLS e sockets fora das portas loopback criadas pela própria suíte estão bloqueados. Tentativas são contadas e fazem a suíte falhar.
- Escrita de conteúdo em arquivos também é bloqueada no processo de teste.
- Os validadores reais recebem a guarda `receiptWorkerIOGuard.cjs` por preload exclusivo do teste. Cada resposta confirma zero tentativas de rede/escrita e o encerramento do worker.
- O ambiente do worker é conferido para ausência de chave OpenAI, ADC, projeto Firebase e `NODE_OPTIONS`.
- Wrappers observacionais em memória acompanham os buffers e o escopo, sem substituir a validação, o consumidor ou o descarte.
- Ao final de cada teste, os buffers observados precisam estar zerados, handles revogados, listeners de abort removidos e workers encerrados. Os documentos são exclusivamente sintéticos; conteúdo e respostas brutas não são registrados em logs.

## Cobertura HTTP

| Grupo | Cenários |
| --- | --- |
| Autenticação/autorização | Sem Bearer, tokens inválidos/expirados/revogados, usuário desabilitado, UID permitido/negado, allowlist vazia/wildcard, configuração Firebase ausente/divergente, falha de inicialização, emulador bloqueado e tentativas por query/cookie/corpo/cabeçalhos duplicados. |
| Documentos | JPG/PNG válidos, PDFs de uma e três páginas, arquivo vazio, extensão/MIME/assinatura divergentes, imagem truncada, PDF protegido/truncado/excessivo, limite de 10 MiB, dimensões/pixels e multipart/campos inválidos. Documentos rejeitados não criam cliente OpenAI. |
| Política fiscal | Extração completa/parcial, campos ausentes/incertos/inferidos, quatro classificações fiscais, documento não fiscal/inconclusivo/ilegível/múltiplo, centavos BRL, teto de valor, valores inválidos, moeda estrangeira/desconhecida, JSON inválido, recusa, resposta incompleta, modelo divergente e inconsistências semânticas. |
| Metadados/modos | Origem determinada pelo servidor; `disabled` preserva 501, `simulated` preserva mensagens e `isSimulated: true`, real sintético usa `false`; configurações incompletas/produção falham fechadas. Query, cabeçalhos e resposta do provedor não mudam a origem. |
| Falhas/custos | Erros de rede/provedor sem vazamento ou retry; quota diária consumida por falha; limite padrão de cinco por minuto; usage ausente/inválido sem custo inventado; observador com falha sem interferir na resposta. |
| Ciclo de vida | Timeout do provedor, desconexão HTTP/cancelamento, cliente atrasado/não cooperativo, prazo do consumidor, descarte de resultado tardio, retenção da reserva até término, liberação para nova operação, concorrência global e isolamento de buffers/clientes/resultados entre UIDs. |

Não é seguro promover a extração completa a `success` nesta rota: `categories: []` permanece obrigatório e o contrato de sucesso exige categoria válida. O resultado esperado é `partial`, sem categoria, mesmo com os demais campos claros. O sucesso completo do adaptador com contexto autorizado continua coberto nos testes anteriores. Não foi criada fonte de categorias, não se inferiu tipo financeiro e não se alterou o contrato para fabricar sucesso.

A simulação conserva dados demonstrativos e não os apresenta como extraídos. Nos casos de origem real sintética, somente a fixture falsa substitui a resposta do provedor; a passagem pela validação fiscal é real.

## Execução

Na raiz, com dependências já instaladas, sem Internet ou credenciais:

```text
node --test tests/receiptAnalyzeRoute.test.cjs
node --test tests/receiptOpenAITransport.test.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node financeiq-api/node_modules/typescript/bin/tsc --noEmit -p financeiq-api/tsconfig.json
git diff --check
```

Os 410 testes anteriores são preservados integralmente. Nenhuma variável de ambiente privada ou dependência precisa ser alterada para executar os testes novos.

Resultado da entrega: 29 testes HTTP novos e os 22 testes anteriores do transporte aprovados; suíte completa com 439 aprovados, sem falhas, cancelamentos ou testes ignorados. TypeScript do frontend/backend e `git diff --check` passaram. As guardas da suíte nova registraram zero tentativas de I/O externo, inclusive nos workers observados.

## Antes de qualquer teste pago

Esta entrega não autoriza nem inicia um teste pago. Permanecem necessários:

1. Autorização explícita para o teste, número de tentativas e definição de orçamento supervisionado. O orçamento declarado e as quotas locais **não são um teto monetário executável**; não garantem gasto máximo.
2. Configuração segura pelo responsável, exclusivamente no backend, de acesso ao projeto/modelo e credencial. Não compartilhar chave pelo chat, versionar segredos ou habilitar o frontend.
3. Um UID de piloto, quotas/concorrência restritas, documento controlado sem dados pessoais e revisão de privacidade/retenção. Manter o bloqueio de produção enquanto não houver controles compartilhados aprovados.
4. Roteiro HTTP direto para uma tentativa acompanhada, verificando classificação, campos, centavos, latência, usage e custo. Ausência de usage impede afirmar custo zero.
5. Encerramento do teste com desativação e reinício do backend, sem salvar lançamentos automaticamente. Cancelamento local não comprova cancelamento remoto nem ausência de cobrança.

Precisão do modelo, disponibilidade na conta, latência real e custos efetivos não são medidos por clientes falsos. Clientes não cooperativos mantêm reservas ocupadas até terminar; testes com gates controlados comprovam essa proteção, sem prometer interrupção arbitrária no mesmo processo. O frontend ainda rejeita `isSimulated: false` e sua adaptação continua separada.

## Revisão após o primeiro piloto real

O fluxo inspecionado permanece: router → autenticação/UID → quotas → multipart → validação binária → escopo documental → adaptador/transporte → validação estrutural e fiscal → término confirmado do transporte → descarte/liberação → controller. O transporte não escolhe a aceitação documental. A origem real vem exclusivamente da configuração interna; nenhuma falha resulta em fallback fictício.

1. `receiptOpenAIAdapter.ts` exige um envelope `completed`, uma mensagem de texto estruturado e JSON conforme o esquema v1. Resposta incompleta, recusa, JSON/estrutura inválidos e inconsistências semânticas produzem falha técnica, sem campos aplicáveis.
2. `receiptExtractionValidation.ts` valida campos, centavos, moeda e data; depois deriva `assessment.acceptance`. Múltiplos documentos são rejeitados. Ilegibilidade e classificação incerta/desconhecida são indeterminadas. Classificação `other` clara e legível é rejeitada. Essas decisões usam precedência explícita; um documento `other` ilegível pode ser inconclusivo, sem afirmar classificação segura.
3. O validador gera `analysis.status: error` quando a aceitação não é `accepted` ou quando não existe descrição, total, tipo ou categoria seguros para aplicação. Para aceitos com campos aproveitáveis, gera `success`/`partial`, omitindo valores ausentes, incertos ou inferidos. Categorias só são resolvidas contra contexto autorizado e ativo; o contexto vazio da rota mantém categoria ausente e impede sucesso completo.
4. O adaptador transforma aceitação rejeitada em resultado `rejected`; aceitação indeterminada ou análise sem campos aplicáveis em `inconclusive`; demais casos preservam `success`/`partial`. As métricas usam esse status documental, não o `status` compatível aninhado na análise.
5. `receiptController.ts` decide HTTP usando o resultado do adaptador. Somente `error`/`cancelled` seguem para HTTP de erro; resultados documentais retornam HTTP 200 com `status` da análise, `documentStatus` do adaptador e `assessment`. A resposta só é enviada após o descarte documental.

| Situação | HTTP | `status` compatível | `documentStatus` / detalhe |
| --- | --- | --- | --- |
| Campos completos e categoria autorizada (adaptador com contexto controlado) | 200 | `success` | `success` |
| Documento aceito com campos seguros incompletos | 200 | `partial` | `partial`; apenas campos seguros presentes |
| Documento incompatível ou múltiplo | 200 | `error` | `rejected`; `assessment.acceptance=rejected`; sem `fields`, `assessment.fields={}` |
| Documento desconhecido, incerto ou ilegível | 200 | `error` | `inconclusive`; `assessment.acceptance=undetermined`; sem `fields`, `assessment.fields={}` |
| Classificação aceita, sem campos seguros de lançamento | 200 | `error` | `inconclusive`; `assessment.acceptance=accepted`; sem `fields` |
| Recusa, resposta incompleta/inválida ou falha técnica comum | 503 | Envelope `error: true` e `code` | Não é rejeição documental; sem campos aplicáveis |
| Rate limit do provedor / timeout / cancelamento detectado pelo adaptador | 429 / 504 / 504 | Envelope `error: true` e `code` | Uma desconexão pode impedir qualquer resposta HTTP |

No caso específico de classificação aceita e somente data segura, `assessment.fields` pode conservar `identifiedDate` informativa, embora não haja `fields` aplicáveis na análise. Isso não define `date` ou `period_month` nem transforma o resultado em parcial. Emitente isolado também não constitui campo de lançamento. A distinção evita afirmar que toda resposta inconclusiva tem necessariamente `assessment.fields` vazio.

O comportamento HTTP relatado no piloto corresponde à política existente; não foi identificado defeito que justificasse alterar aceitação, contrato ou códigos HTTP. A limitação de nomenclatura é preservada e esclarecida: `status: error` sozinho não distingue problema documental de falha técnica; consultar também HTTP, `documentStatus` e `assessment`/`code`, conforme o envelope.

Cobertura ajustada apenas nas lacunas: o teste HTTP de rejeição/inconclusão agora verifica origem real, aceitação, ausência de código técnico e status documental nas métricas; o de leitura parcial verifica HTTP, aceitação e preservação da descrição segura. Um teste novo cobre classificação aceita sem campos de lançamento (todos ausentes, emitente isolado ou data informativa isolada). Não se replica a resposta privada do piloto. Clientes, autenticação e documentos continuam falsos/sintéticos, com guardas de rede externa e observação de descarte já existentes. Código de produção, frontend, configuração e trava operacional permanecem inalterados.

Validação desta revisão: 117 testes pertinentes aprovados nas suítes de rota, adaptador, transporte, validação fiscal e simulação; suíte completa com 463 aprovados (462 anteriores e um novo), sem falhas, cancelamentos ou testes ignorados. TypeScript do frontend e do backend e `git diff --check` passaram. Nenhuma chamada real foi executada, nenhum arquivo privado foi acessado e o marcador operacional não foi consultado nem alterado.
