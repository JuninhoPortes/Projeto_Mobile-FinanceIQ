# Etapa 6B.2 — transporte OpenAI, sem chamadas reais na entrega

O transporte `src/services/receiptOpenAITransport.ts` utiliza `openai@7.33.0`, SDK oficial instalado exclusivamente no backend, compatível com Node.js >= 22. A versão é fixa. O transporte foi validado com clientes falsos e com o SDK recebendo um `fetch` falso, sem conexão externa, chave real ou documentos pessoais. O frontend permanece inalterado.

## Fluxo e responsabilidades

Firebase/Bearer → UID autorizado → quotas/reserva → multipart → validação binária isolada → consumidor → adaptador → transporte Responses → validação fiscal existente → término local confirmado → descarte → liberação → controller.

O adaptador continua responsável por montar imagens JPG/PNG como `input_image` e PDFs como `input_file` inline, utilizando o esquema v1 com `strict: true`, `store: false`, `stream: false`, sem ferramentas, histórico ou Files API. O modelo padrão continua `gpt-5.4-mini-2026-03-17`. Não foi adicionado OCR local, redimensionamento ou outro motor fiscal.

O transporte só chama `client.responses.create`. A resposta permanece `unknown` até passar pelo parsing estrutural e por `validateReceiptExtraction`. Recusas, respostas incompletas, JSON inválido, valores inconsistentes e documentos incompatíveis não produzem campos aplicáveis. A leitura parcial preserva ausências e incertezas. Origem e `isSimulated` continuam sendo definidos pelo servidor, independentemente de metadados presentes na resposta do provedor ou na requisição HTTP.

A rota mantém contexto de categorias vazio: não inventa categoria nem consulta Firestore. A ausência de evidência da perspectiva financeira também não deve ser preenchida por suposição. Data identificada continua informativa. Nada salva lançamentos automaticamente.

## Configuração e bloqueios

O padrão continua `RECEIPT_ANALYSIS_MODE=disabled`, com HTTP 501 após upload válido. `simulated` continua restrito a desenvolvimento/piloto local e indica dados demonstrativos. Não lê chave OpenAI nem cria cliente SDK. Não há fallback entre os modos.

O modo `real` exige **todas** as condições:

- `RECEIPT_ANALYSIS_MODE=real`.
- `RECEIPT_OPENAI_REAL_CALLS_ENABLED=true`, exatamente. O exemplo mantém `false`.
- `NODE_ENV=development` e `RECEIPT_LIMITS_MODE=local-single-process`.
- `RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS` como inteiro positivo seguro, representando a declaração do orçamento do teste supervisionado em centavos de dólar americano.
- `OPENAI_API_KEY` não vazia, sem espaços, exclusivamente no ambiente protegido do backend.
- Modelo/limite de saída válidos e prazo do provedor estritamente menor que o do consumidor.
- Autenticação, autorização por UID, validação documental e quotas já existentes.

Configuração ausente/inconsistente retorna 503, sem criar cliente, enviar documento ou produzir dados simulados. Produção continua bloqueada pelos controles locais existentes. Os parâmetros de simulação não selecionam comportamento no modo real.

A configuração real é capturada na criação do middleware; alterações exigem reiniciar o backend. As variáveis não constituem um interruptor dinâmico para operações já iniciadas.

`.env.example` contém apenas valores seguros: modo desabilitado, habilitação adicional falsa, chave e orçamento vazios. O exemplo usa 10 s para o provedor e 15 s para o consumidor; o fallback legado do adaptador permanece 15 s para compatibilidade. Portanto, habilitar real com prazos iguais falha de forma fechada. Recomenda-se uma margem operacional entre os prazos, sem ampliar limites automaticamente.

**Não configurar a chave nem ativar chamadas nesta entrega.** Um teste real exige autorização posterior, definição do orçamento, configuração local pelo responsável e acompanhamento. Não colocar a chave no repositório, em `EXPO_PUBLIC_`, frontend, worker, mensagens de erro ou logs.

O SDK é inicializado preguiçosamente após validação do documento, com chave explícita, destino fixo `https://api.openai.com/v1`, organização/projeto nulos e logging desligado. Não herda `OPENAI_BASE_URL`, chaves administrativas ou configurações de webhook. Nenhum arquivo privado foi criado ou modificado.

## Timeout, cancelamento e término local

`maxRetries: 0` é aplicado ao cliente e à chamada. Não há tentativa adicional de aplicação, fallback de modelo ou chamada de cancelamento remoto. O timeout é explícito no SDK e no transporte. O sinal recebido do consumidor é propagado a um controlador próprio e à chamada do SDK.

O transporte acompanha a Promise completa do SDK, incluindo leitura da resposta, e remove seu timer/listener em `finally`. Após timeout/cancelamento, uma resposta tardia é descartada. `whenIdle()` aguarda o encerramento das operações iniciadas. O adaptador real também aguarda esse término antes de limpar seu payload ou retornar; a ponte preserva a espera existente em `finally`. Só então o middleware proprietário zera os bytes e libera a reserva.

Não se usa uma corrida no transporte para abandonar uma operação pendente. Clientes injetados devem cooperar com `AbortSignal`, assim como o SDK. Se um cliente não cooperar, a reserva permanece ocupada até ele terminar; não é possível interromper código arbitrário no mesmo processo. A supervisão operacional e a detecção de operações presas continuam necessárias para produção.

**Cancelamento local não comprova interrupção do processamento remoto nem ausência de cobrança** se a requisição já alcançou o provedor. Base64, memória gerenciada e cópias internas também não oferecem apagamento físico absoluto.

## Erros, métricas e custo

O adaptador preserva a normalização existente: autenticação do provedor, limite de uso, indisponibilidade/rede, solicitação inválida e timeout. Não retorna erro bruto, payload ou resposta bruta ao cliente. Erros do provedor não viram falhas de autenticação Firebase. O controller conserva os códigos HTTP existentes e `isSimulated: false` para resultados reais, inclusive falhas identificadas após a configuração.

`onMetrics` é uma dependência interna opcional: recebe apenas modelo, origem simulada ou real pelo indicador, status, duração e tokens/custo estimado. Não há logger de conteúdo, UID ou credenciais. `usage` ausente/inválido produz contagens e estimativa nulas, nunca custo zero inventado. As tarifas existentes são referências operacionais, sujeitas à atualização.

Quotas continuam locais, por UID e globais, incluindo tentativas admitidas que falham. **Quotas e orçamento declarado não constituem teto monetário executável.** Não há reserva financeira, ledger persistente ou interrupção garantida de gasto por esse valor. A declaração é uma condição explícita para o futuro piloto supervisionado; controle monetário efetivo e controles distribuídos são pendências de produção.

`store: false` não equivale a Zero Data Retention. Enviar o arquivo original também envia eventual conteúdo pessoal e metadados. Retenção do provedor e política de privacidade precisam ser consideradas antes de qualquer documento real.

## Testes locais

`tests/receiptOpenAITransport.test.cjs` injeta `createOpenAIClient` exclusivamente por código. Dados e identificador de autenticação são fictícios; não depende de `OPENAI_API_KEY` no ambiente, saldo ou rede. Outra camada usa o próprio SDK com `fetch` falso para provar payload e ausência de retries. Guardas bloqueiam fetch global, HTTPS, sockets externos e escrita. Somente portas loopback criadas pela suíte são permitidas.

Cobertura: JPG/PNG/PDF, configuração, metadados, respostas válidas/parciais, classificação, erros fiscais, falhas operacionais, timeouts, aborts, resultados tardios, autenticação, quotas, concorrência, descarte e compatibilidade dos modos anteriores. Nenhuma tentativa de acessar a OpenAI é permitida.

Comandos na raiz:

```text
node --test tests/receiptOpenAITransport.test.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node financeiq-api/node_modules/typescript/bin/tsc --noEmit -p financeiq-api/tsconfig.json
git diff --check
```

## Etapa posterior

Ficam pendentes: orçamento e autorização do primeiro teste real, configuração segura pelo responsável, verificação de acesso ao modelo, precisão/latência/custo em documentos controlados e política de privacidade/retenção. O frontend ainda rejeita `isSimulated: false`; não deve ser usado para testar o modo real nesta fase. Nenhuma ativação ou trabalho da Etapa 6B.3 faz parte desta entrega.

Referências oficiais: [Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), [SDK: retries, timeout e cancelamento](https://developers.openai.com/api/reference/typescript), [retenção](https://developers.openai.com/api/docs/guides/your-data).
