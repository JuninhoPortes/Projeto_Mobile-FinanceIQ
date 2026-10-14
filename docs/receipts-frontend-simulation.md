# Etapa 5B.2A — frontend com backend simulado

Atualização: o [suporte a respostas reais](receipts-frontend-real.md) reutiliza este fluxo com seleção explícita de origem, validação e revisão antes de Salvar. As restrições descritas abaixo são históricas da 5B.2A; o novo modo de desenvolvimento `backend-real` não habilita chamadas nem altera o bloqueio operacional do servidor.

## Escopo e fluxo

Branch verificada: `feat/leitura-notas-openai`. O Git estava limpo e os commits anteriores eram `b72558e` (backend simulado) e `91a4dec` (tipagem e contadores). Não foram alterados backend, autorização, quotas, ciclo documental do servidor, credenciais, `.env` reais ou dependências.

O fluxo permanece: **+ → Novo Lançamento → Importar nota fiscal → câmera/arquivo → análise → revisão manual → Salvar**. O seletor e a câmera existentes continuam sendo utilizados. Não foram alterados `Transaction`, `source`, data, competência, regras de categorias, Open Finance, lançamentos fixos ou os handlers de persistência.

1. `receiptAnalysisService` escolhe explicitamente mock ou backend simulado. A importação do serviço de backend é preguiçosa; o mock não solicita token nem lê/envia o arquivo.
2. `receiptBackendService` valida os metadados e reutiliza `api.defaults.baseURL`, configurável por `EXPO_PUBLIC_API_URL`. Obtém o ID token pelo método oficial `auth.currentUser.getIdToken()`, sem armazená-lo ou registrá-lo. Não instala interceptores nos serviços anteriores.
3. `receiptMultipartService` usa um único campo `document`. No Android, o FormData do React Native recebe o descritor `{ uri, name, type }`, aceitando `file://` e `content://`. A extensão nativa possui uma tipagem local restrita, pois a assinatura DOM não declara esse descritor; não há conversão fictícia para Blob nem alteração global de tipos. Na Web, a URL `blob:` do seletor é lida localmente como Blob/File, com verificação de tamanho e MIME, e anexada ao FormData com o nome original. Nenhum Bearer é enviado na leitura local.
4. O POST envia apenas `Authorization: Bearer ...`, sem UID ou categorias no corpo, cookies ou `Content-Type` multipart manual. O runtime gera o boundary. O limite continua sendo 10 MiB; o backend mantém a validação binária, páginas, dimensões, quotas e autenticação.
5. `receiptBackendResponseService` valida em runtime a resposta HTTP 200, exige `provider: backend` e `isSimulated: true`, confere `documentStatus`, avaliação e campos permitidos. Rejeita conflitos com campos ausentes/incertos, valores inválidos, centavos fracionários e contratos inesperados. Não exige `code` no sucesso e não apresenta mensagens brutas vindas da rede.
6. O resultado compatível passa pelo `receiptFormService` existente. A descrição, o valor, o tipo e a categoria só são aplicados quando válidos. Campos ausentes preservam valores anteriores; uma mudança de tipo ainda pode limpar uma categoria incompatível, conforme a regra anterior. `identifiedDate` permanece apenas informativa e nunca muda a data ou competência.
7. O formulário acompanha uma revisão em ref. Edição manual de descrição, valor, tipo, categoria ou aplicação da sugestão existente invalida a análise que já estava em andamento, mesmo antes da renderização seguinte. Fechar o formulário, sair da tela, cancelar ou iniciar outra operação após cancelamento também impede respostas antigas de serem aplicadas.
8. Apenas **Salvar** persiste a transação, pelo mesmo handler e payload anteriores. Nenhum documento é incluído nesse payload.

## Seleção de modo

| `EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE` | Comportamento |
| --- | --- |
| ausente ou `mock` | mock local anterior; em produção mantém cenário seguro anterior |
| `backend-simulated` em desenvolvimento | upload para o servidor FinanceIQ e dados explicitamente demonstrativos |
| valor desconhecido ou backend em produção | análise bloqueada; sem troca para mock |

Configurações `EXPO_PUBLIC_*` são públicas e incorporadas pelo Expo: nunca colocar tokens, credenciais administrativas ou API keys nelas. O arquivo `.env.example` raiz é apenas um exemplo; nenhum `.env` real foi criado ou modificado. Reiniciar o Expo e recarregar o aplicativo após mudar o modo/endereço. Não há seletor técnico na interface.

`api.ts` mantém o endereço de exemplo anterior como fallback quando a variável de URL não está definida. O modo backend detecta essa ausência de configuração e não envia o documento. A variável de URL é compartilhada com os serviços HTTP anteriores, cujo timeout e autenticação permanecem iguais.

Não existe modo OpenAI real nem fallback silencioso. Uma build de produção com `backend-simulated` configurado mostra indisponibilidade. Para testar a simulação, usar Expo em desenvolvimento.

## Erros, cancelamento e categorias

O serviço apresenta mensagens controladas para HTTP 400, 401, 403, 413, 415, 422, 429, 501, 503 e 504, além de rede/JSON inválidos. Em todos esses casos, não retorna campos financeiros para aplicação. Não há retries automáticos. O timeout de 45 segundos abrange token, preparação do multipart e resposta; o cancelamento aborta a requisição e descarta resultados mesmo se um double de transporte ignorar o abort. A identidade Firebase é reconferida após cada espera relevante para impedir uso do resultado depois de troca de usuário/logout.

O backend atual não consulta categorias no Firestore, por isso seu cenário `success` retorna `partial` na rota, sem categoria. O cliente preserva uma categoria existente compatível e permite seleção manual; não atribui uma arbitrária. Não foram criadas categorias nem chamadas adicionais ao Firestore. `categorySuggestionService`, palavras-chave e regras anteriores não foram modificados.

A melhoria de sugestão fica para **5B.2B**, mediante autorização: reutilizar categorias ativas já carregadas e os serviços atuais, distinguindo sugestão local de reconhecimento documental. Atenção ao efeito existente de `categoryService.listAll`, que chama a criação de categorias padrão: a importação não deve acrescentar outra chamada.

## Preparação do teste manual

Usar conta de testes e documentos sintéticos válidos (JPG/JPEG, PNG e PDF de uma a três páginas, até 10 MiB). Uma transação demonstrativa só será registrada se você clicar em Salvar; ela pode ser editada ou excluída pelo fluxo existente.

No terminal do backend, mantendo as credenciais já configuradas fora do repositório e o mesmo projeto Firebase do aplicativo:

```powershell
$env:NODE_ENV='development'
$env:RECEIPT_LIMITS_MODE='local-single-process'
$env:RECEIPT_ANALYSIS_MODE='simulated'
$env:RECEIPT_SIMULATION_SCENARIO='success'
$env:RECEIPT_SIMULATION_DELAY_MS='250'
# FIREBASE_PROJECT_ID e RECEIPT_PILOT_UIDS precisam corresponder ao projeto e usuário de testes.
# Usar a configuração administrativa existente; nunca copiar credenciais para o aplicativo.
Set-Location financeiq-api
npm run dev
```

O UID autenticado deve estar autorizado em `RECEIPT_PILOT_UIDS`. Lista vazia nega o acesso. Consulte as configurações já existentes de [autenticação](../financeiq-api/docs/receipts-auth.md) e [simulação backend](../financeiq-api/docs/receipts-backend-simulation.md). Não desativar validação de token para testar.

No terminal raiz do frontend, para Web no mesmo computador:

```powershell
$env:EXPO_PUBLIC_API_URL='http://localhost:3000'
$env:EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE='backend-simulated'
npm run web
```

Para Android, usar a URL do servidor acessível pelo emulador/dispositivo, somente no ambiente local. O emulador Android padrão pode acessar o computador por `http://10.0.2.2:3000`; um aparelho físico precisa do endereço acessível do computador na mesma rede. Não usar `localhost` no aparelho para alcançar o computador. Confirmar porta, firewall e conectividade; o backend existente já escuta em `0.0.0.0`. Não inserir endereços pessoais no código. Em seguida executar `npm run android` com o ambiente configurado e o emulador/dispositivo disponível, ou `npm start` e abrir pelo Expo Go compatível.

Na Web, uma página HTTPS não poderá acessar uma API HTTP por bloqueio de conteúdo misto; usar origens locais compatíveis ou HTTPS devidamente configurado. O CORS existente do backend não foi alterado.

## Roteiro manual

1. **Mock local no navegador:** definir `EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE=mock`, reiniciar o Expo, abrir **+**, preencher alguns campos e importar uma imagem ou PDF. Conferir dados simulados e ausência de POST `/receipts/analyze` na aba Network. Revisar e cancelar para confirmar que nada foi salvo. Os cenários locais continuam em `receiptMockConfig`.
2. **Backend no navegador:** selecionar `backend-simulated`, configurar a URL e entrar com o usuário autorizado. Abrir **+ → Importar nota fiscal → Escolher arquivo**. Testar JPG, PNG e PDF separadamente. Conferir um único POST por importação e resposta 200 com `isSimulated: true`, sem necessidade de `code`. Não copiar nem compartilhar o cabeçalho Bearer.
3. **Dados demonstrativos:** no cenário servidor `success`, esperar descrição demonstrativa e R$ 129,90, com estado parcial e categoria ausente no retorno. Conferir que a categoria compatível já escolhida permanece e, se necessário, selecioná-la manualmente.
4. **Android/câmera:** com URL acessível e mesmo usuário autorizado, abrir **Tirar foto**, permitir a câmera e fotografar uma nota sintética. Aguardar o upload e conferir o aviso demonstrativo. Repetir com **Escolher arquivo** para imagem e PDF, inclusive um arquivo disponibilizado por provedor Android. Recusar/cancelar a câmera deve preservar o formulário.
5. **Parcial:** mudar no servidor `RECEIPT_SIMULATION_SCENARIO=partial` e reiniciá-lo. Preencher valor e categoria antes da importação. O total ausente não deve apagar o valor; a categoria compatível deve permanecer. Não deve haver criação de categoria.
6. **Edição manual após resultado:** voltar ao formulário e editar descrição, valor, tipo e categoria. Os campos continuam editáveis. Trocar o tipo mantém as regras anteriores de compatibilidade de categoria.
7. **Edição durante a espera:** definir delay servidor em `3000` e reiniciar. Iniciar importação, tocar em **Voltar ao formulário** durante a análise e corrigir os campos; a operação é cancelada. Para verificar edição simultânea onde a plataforma permitir interação, confirmar que a resposta não substitui correções feitas após o início. A proteção também está coberta por testes dos handlers reais.
8. **Cancelamento/resposta antiga:** iniciar análise com delay, cancelar, importar outro arquivo e aguardar. Apenas a operação atual pode preencher campos. Fechar/reabrir Novo Lançamento ou sair da tela deve invalidar o resultado anterior.
9. **Salvar manualmente:** confirmar antes de Salvar que não apareceu lançamento novo. Revisar dados demonstrativos, escolher categoria válida e clicar em **Salvar** uma vez. Deve ser criado um único lançamento pelo fluxo anterior; a data/competência seguem a lógica existente, não a data identificada na análise.
10. **Falha de comunicação:** parar o backend e tentar importar. Deve aparecer erro, mantendo os campos e sem resultado do mock como fallback. Reiniciar o servidor e tentar novamente manualmente.
11. **Rejeição/ilegível/erro/timeout:** testar os cenários servidor `rejected`, `unreadable`, `error` e `timeout`, reiniciando após cada troca. Todos devem preservar os campos. Remover o usuário da lista do piloto gera 403; modo servidor `disabled` gera 501 após upload válido. Repetições podem atingir a quota e retornar 429; não contornar os limites.
12. Ao terminar, voltar o modo cliente para `mock` ou desabilitar a análise no servidor, conforme o ambiente de testes desejado.

## Verificações automatizadas e limites

As suítes acrescentadas cobrem token Firebase por double, multipart Android e Web, contrato completo/parcial, categoria ausente, rejeição/ilegibilidade, HTTPs de erro, timeout, cancelamento, troca de usuário, resposta atrasada e ausência de fallback. Os testes de integração do formulário cobrem edições manuais, nova importação, fechamento, ausência de persistência automática e o payload original de Salvar. Os testes HTTP executam o serviço Web contra a rota Express real e parsers reais, somente em loopback e com documentos sintéticos; a verificação Firebase é injetada em teste, sem credenciais reais.

Executar na raiz:

```powershell
node --test tests/*.test.cjs
./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.json
./financeiq-api/node_modules/.bin/tsc.cmd --noEmit -p financeiq-api/tsconfig.json
./node_modules/.bin/expo.cmd export --platform web --platform android --output-dir dist/receipt-5b2a
git diff --check
```

Bundle não substitui teste de câmera, permissões, provedor de arquivos Android ou inspeção visual em navegador/aparelho. Os testes automatizados não validam tokens reais, credenciais administrativas nem conectividade do seu ambiente. A etapa não interpreta o conteúdo do documento, não usa OpenAI e não melhora a categorização automática. 5B.2B e Etapa 6 permanecem dependentes de aprovação separada.

Resultados executados nesta etapa: **203 testes aprovados (168 anteriores + 35 novos)**, sem falhas, cancelamentos ou testes ignorados. TypeScript raiz e backend passaram sem diagnósticos. Exportações Web e Android passaram em produção (`dist/receipt-5b2a`, Android Hermes) e em desenvolvimento com `EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE=backend-simulated` (`dist/receipt-5b2a-development`), usando `--max-workers 2` e `EXPO_OFFLINE=1`. Os diretórios gerados são ignorados pelo Git. `git diff --check` passou. Nenhum teste manual em navegador/aparelho ou autenticação Firebase real foi executado nesta etapa.
