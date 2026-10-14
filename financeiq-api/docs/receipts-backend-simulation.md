# Etapa 5B.1 — consumidor e backend simulado

## Escopo

Esta parte conecta o consumidor da Etapa 5A ao adaptador da Etapa 4. A implementação original não modificou o frontend; a revisão corretiva posterior acrescentou apenas os contadores ausentes no retorno de `transactionService`, conforme descrito abaixo. A parte 5B.2 depende de aprovação humana separada. Não existe modo real, SDK, API key, Files API ou comunicação com a OpenAI.

Fluxo: Bearer/Firebase → piloto por UID → quotas/concorrência → multipart → validação isolada → consumidor por requisição → adaptador com transporte falso → validadores v1 → término confirmado do transporte → descarte → liberação → resposta.

O transporte falso da Etapa 4 foi promovido de seu helper de testes para `src/services/receiptSimulatedTransport.ts`. O helper anterior utiliza esse mesmo transporte, mantendo gravação de chamadas apenas para fixtures sintéticas dos testes. O transporte usado pela rota não registra nem retém histórico de requests, documentos ou respostas.

## Configuração exclusiva do servidor

| Variável | Valor/padrão |
| --- | --- |
| `RECEIPT_ANALYSIS_MODE` | `disabled` por padrão; somente `simulated` pode habilitar interpretação demonstrativa |
| `NODE_ENV` | Deve ser exatamente `development` para simulação |
| `RECEIPT_LIMITS_MODE` | Deve continuar `local-single-process` para o upload local |
| `RECEIPT_SIMULATION_SCENARIO` | `success`, `partial`, `rejected`, `unreadable`, `error` ou `timeout`; padrão `success` |
| `RECEIPT_SIMULATION_DELAY_MS` | Inteiro de 0 a 5000; padrão 250 |

Também continuam obrigatórios o projeto Firebase, credenciais administrativas no servidor, UID autorizado no piloto e todos os limites das etapas anteriores. Reiniciar o processo após alterar a configuração. Nenhuma configuração vem de query, corpo, nome de arquivo ou cabeçalho do cliente. `.env` real não foi alterado.

- `disabled` ou configuração de modo ausente: preserva upload/validação e HTTP 501 / `RECEIPT_ANALYSIS_NOT_IMPLEMENTED`.
- `simulated` fora de `development`, modo desconhecido (inclusive `real`) ou cenário/delay inválidos: 503 / `RECEIPT_ANALYSIS_UNAVAILABLE`, após autenticação/autorização, sem interpretar documentos.
- Controles de upload desativados/produção: permanecem bloqueados conforme a Etapa 3, sem fallback ilimitado.

## Contrato HTTP para a parte 5B.2

Em modo simulado, resultados documentais recebem HTTP 200 e preservam o formato aplicável de `ReceiptAnalysisResult`, acrescido de `documentStatus` e `assessment` validados:

```json
{
  "provider": "backend",
  "isSimulated": true,
  "status": "partial",
  "message": "Dados demonstrativos, não extraídos do documento. Simulação: ...",
  "fields": {
    "description": "SIMULAÇÃO — compra demonstrativa",
    "amount": 129.9,
    "type": "outcome"
  },
  "documentStatus": "partial",
  "assessment": {
    "acceptance": "accepted",
    "reasonCodes": [],
    "missingFields": ["category", "identifiedDate"],
    "uncertainFields": [],
    "fields": {
      "description": "SIMULAÇÃO — compra demonstrativa",
      "amount": 129.9,
      "type": "outcome"
    }
  }
}
```

`documentStatus` distingue `success`, `partial`, `rejected` e `inconclusive`. Nos dois últimos, o `status` compatível é `error` e não há `fields` aplicáveis. Nas fixtures de documento rejeitado/indeterminado desta simulação, `assessment.fields` é vazio; uma classificação aceita sem campos de lançamento pode ser inconclusiva e conservar somente `identifiedDate` informativa em `assessment.fields`, conforme a [revisão do contrato](receipts-route-validation.md#revisão-após-o-primeiro-piloto-real). A simulação não classifica o arquivo enviado nem reconhece seu conteúdo: o cenário é escolhido exclusivamente no servidor.

Falhas técnicas usam `{ error: true, code, message, isSimulated: true }`, sem campos financeiros: 504 para timeout/cancelamento do adaptador, 429 para rate limit e 503 para outras falhas de interpretação. Erros anteriores (401/403, formato, tamanho, quotas e cancelamento do ciclo documental) mantêm seus envelopes existentes e podem não conter `isSimulated`, pois não houve análise.

O frontend futuro deve validar a resposta em runtime, aplicar somente `success`/`partial` válidos, manter dados do formulário em erros e exigir Salvar. Nenhuma persistência foi criada nesta parte.

## Categorias e dados demonstrativos

A rota ainda não possui uma fonte autenticada de categorias por UID. Para não inventar categorias, não consultar Firestore ou ampliar permissões, o contexto de categorias da rota é vazio. Assim, o cenário `success` produz uma extração **parcial** na rota, sem `category`; o usuário poderá selecionar/preservar uma categoria existente no formulário na parte 5B.2. Isso é intencional, e não uma promoção indevida de informação ausente.

Os testes também verificam sucesso completo do mesmo transporte/adaptador quando recebem um contexto controlado de categoria existente. A rota atual permanece parcial, pois não recebe esse contexto. Não foi criada uma lista fixa de categorias supostamente pertencentes ao usuário.

### Estratégia proposta para 5B.2 (somente documentação)

Reutilizar no cliente `availableCategories`, já carregadas para o usuário autenticado pelo fluxo existente de `categoryService`, e `categorySuggestionService.suggestCategory({ description, type, categories })`. Considerar apenas descrição e tipo validados; sem tipo seguro, manter seleção manual. O serviço de sugestão já filtra por `is_active` e tipo financeiro e retorna a categoria existente, confiança e necessidade de confirmação. A sugestão local deve ser distinguida de um campo reconhecido no documento; não deve promover o status documental do backend.

Não chamar `categoryService.add` nem `createDefaultCategories` para resolver uma nota. Atenção: `categoryService.listAll` atualmente chama `createDefaultCategories` antes da leitura. Por isso, a futura importação deve reutilizar a lista já carregada, sem uma chamada adicional a `listAll` motivada pela nota. Se a lista estiver indisponível ou não houver correspondência única, manter seleção manual; não inventar uma categoria de fallback.

Preservar a categoria manual quando compatível com o tipo, exigir confirmação antes de aplicar uma sugestão da importação e revalidar se a categoria continua ativa e compatível antes de salvar. Reutilizar `prepareReceiptFormPatch` e respeitar o bloqueio atual em `receiptCategoryOverrideRef`, que impede o efeito de sugestões de substituir uma categoria durante a importação. Qualquer ajuste desse fluxo depende da aprovação de 5B.2. Não enviar categorias ao backend, ampliar permissões administrativas nem consultar Firestore no servidor para essa sugestão. Esta revisão não altera esses serviços ou o formulário.

O total de R$ 129,90 e a descrição são fixtures demonstrativas, claramente marcadas. `partial` omite o total. `rejected` e `unreadable` não fornecem campos aplicáveis; `error` e `timeout` não fornecem valores financeiros. A data identificada é ausente na fixture e não altera data/competência. Nenhum resultado usa nome, texto ou bytes do documento para fingir reconhecimento.

## Posse, cancelamento e término

O middleware aceita uma fábrica de consumidor por resposta, como quarto argumento interno. A instância de quotas continua sendo única por middleware, não recriada por requisição. A fábrica só é invocada após validação bem-sucedida e cria adaptador/transporte/resultado próprios da requisição.

Não há documento em `res.locals`: apenas o resultado estruturado validado é colocado ali após a interpretação e confirmação de término. O controller o remove e responde somente depois do `finally` que zera bytes e libera a reserva. Não são expostos request/response brutos ou métricas de token ao cliente.

O transporte simulado aguarda um timer limitado e coopera com abort, removendo listener/timer ao concluir ou cancelar. `whenIdle()` também permite aguardar a confirmação de todos os trabalhos iniciados, inclusive se um double de teste ignora abort temporariamente. O consumidor aguarda essa confirmação em `finally`; portanto, o timeout do adaptador não causa liberação antecipada da reserva ou dos bytes.

Nenhum consumidor/transporte arbitrário é selecionável por configuração HTTP. A rota instancia apenas o transporte falso com cenário fixo e espera limitada. Permanecem as limitações documentadas de memória/IPC, consumidores confiáveis e supervisão de processos da Etapa 5A. Não há retries, fallback de modelo ou troca silenciosa para o mock do frontend.

## Verificações e limitações desta parte

`tests/receiptBackendSimulation.test.cjs` cobre autenticação, modos, respostas, formatos, quotas, timeouts, desconexão, isolamento e confirmação de término antes do descarte. Bloqueia requisições externas e escrita no processo dos testes; HTTP é permitido apenas nas portas loopback criadas pelos próprios testes. Os validadores de imagem/PDF são reais, sem dados pessoais.

O TypeScript do backend é verificado separadamente. Na revisão corretiva autorizada, a compilação com as fontes do HEAD `940465e` em memória reproduziu os cinco diagnósticos anteriores. Os três de `ProcessEnv.NODE_ENV` eram causados pela declaração global do Expo (`NODE_ENV` obrigatório), aplicada indevidamente aos mapas parciais de ambiente do servidor. Não faltavam tipos Node.js. O `tsconfig.json` raiz agora preserva todas as exclusões originais do Expo e acrescenta somente `financeiq-api` e `tests` (suíte Node que importa o servidor e o reincluía transitivamente). Todos os arquivos do aplicativo continuam incluídos; o backend continua coberto por seu próprio `tsconfig`, sem alterar `strict`, declarações globais, allowlist de ambiente do worker ou bloqueios de produção.

Os dois erros de `OpenFinance.tsx` eram retornos ausentes em `transactionService`: a tela já lia `skippedCount` e `removedCount`. A revisão acrescenta apenas metadados ao retorno: entradas recebidas menos importações concluídas e número de exclusões após `Promise.all` bem-sucedido, respectivamente. Consultas, deduplicação, filtros e payloads persistidos permanecem iguais; falhas continuam rejeitando as operações. A tela não foi modificada. Testes com Firestore substituído verificam contadores e operações, sem acessar dados reais.

Pendência funcional preexistente, fora desta correção: a tela passa `selectedBank.accountId` à remoção, mas o serviço compara o argumento com `bank_name`. Quando esses valores diferem, nenhuma transação corresponde ao filtro. A revisão preserva esse critério e retorna a contagem efetiva (inclusive zero); corrigir a seleção de transações exige autorização separada, pois altera quais registros são excluídos.

A revisão também acrescenta teste HTTP para campos incertos e asserções de que respostas documentais HTTP 200 têm `isSimulated: true` e não contêm `code`. Sucesso completo continua testado no adaptador com contexto controlado, sem introduzir categorias no endpoint. As guardas da suíte bloqueiam chamadas externas e escrita no processo de testes; não há SDK ou transporte real configurado.

Validação da revisão: `tsc --noEmit -p tsconfig.json` na raiz e `tsc --noEmit -p financeiq-api/tsconfig.json` com o compilador do backend passaram sem diagnósticos. A suíte completa passou com 168 testes (161 anteriores, seis sobre os contadores e um HTTP sobre campos incertos), sem falhas, cancelamentos ou testes ignorados. `git diff --check` passou. Nenhuma dependência foi instalada e nenhum endpoint foi alterado nesta revisão. A autenticação nos testes HTTP utiliza verificador injetado, sem validar tokens reais no Firebase.

Android/web, seleção de backend, obtenção do ID token no cliente e revisão visual permanecem pendentes da parte 5B.2. Não foram gerados bundles nesta parte, pois nenhum arquivo do aplicativo foi modificado.

## Teste manual HTTP local

1. Configurar no ambiente do backend `NODE_ENV=development`, `RECEIPT_LIMITS_MODE=local-single-process`, `RECEIPT_ANALYSIS_MODE=simulated`, cenário desejado, projeto Firebase e UID autorizado. Reiniciar o backend. Não é necessária API key OpenAI.
2. Gerar um PNG sintético e usar o roteiro PowerShell com prompt oculto do token em [receipts-upload.md](receipts-upload.md#teste-http-local-sem-expor-token), campo multipart `document`. Não usar documentos pessoais.
3. Com `success`, esperar HTTP 200, `isSimulated: true`, `documentStatus: partial`, total demonstrativo e categoria ausente. Com `partial`, o total também deve estar ausente.
4. `rejected`/`unreadable`: HTTP 200 com status compatível `error`, sem campos aplicáveis. `error`: 503; `timeout`: 504.
5. Definir `RECEIPT_SIMULATION_DELAY_MS=3000` e cancelar o cliente durante a espera para testar desconexão. Uma nova requisição deve poder usar a reserva após a limpeza.
6. Voltar `RECEIPT_ANALYSIS_MODE=disabled`, reiniciar e confirmar 501 para o mesmo upload válido.

O aplicativo continua usando seu mock local anterior. Testes manuais de importação no Android/web, alternância de backend, revisão e salvamento serão preparados após aprovação da parte 5B.2. Nenhuma etapa real com OpenAI foi ativada.
