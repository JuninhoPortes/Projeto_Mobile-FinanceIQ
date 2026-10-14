# Etapa 6B.3 — validação HTTP completa sem serviços externos

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
