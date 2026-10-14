# Análise fiscal real local no aplicativo

A entrada operacional é distinta do piloto consumido. Ela reutiliza o router, Firebase Admin, validação de upload, adaptador OpenAI, Responses API, parser de resposta do aplicativo e formulário de conferência existentes. Não altera nem consulta o marcador do piloto. O objetivo é usar a sessão do aplicativo, sem copiar ID token nem fazer POST manual.

## Configuração única no Windows

As dependências já estão no projeto. Requer Node compatível com o backend, credencial OpenAI válida, ADC Firebase do mesmo projeto do aplicativo e UID da conta de teste autorizado. Nenhuma credencial é entregue junto com o código ou configurada automaticamente. Não envie credenciais pelo chat. Esta entrega não fez chamadas reais.

Na raiz, criar um arquivo de configuração **fora do repositório**, sem sobrescrever um existente:

```powershell
$receiptLocalFolder = Join-Path $env:LOCALAPPDATA 'FinanceIQ\receipt-local'
$receiptLocalFile = Join-Path $receiptLocalFolder 'backend.env'
New-Item -ItemType Directory -Path $receiptLocalFolder -Force | Out-Null
if (-not (Test-Path -LiteralPath $receiptLocalFile)) {
    Copy-Item -LiteralPath 'financeiq-api/receipt-local.env.example' -Destination $receiptLocalFile
}
notepad $receiptLocalFile
```

Preencher localmente `OPENAI_API_KEY`, `FIREBASE_PROJECT_ID` e `RECEIPT_LOCAL_UID` (UID único, não token; Firebase Console → Authentication → Users). Definir **ambas** as flags `RECEIPT_LOCAL_REAL_ENABLED=true` e `RECEIPT_OPENAI_REAL_CALLS_ENABLED=true` quando quiser ativar o uso real supervisionado. O exemplo mantém ambas falsas. Não adicionar aspas escapadas ou exportações PowerShell ao arquivo; ele usa sintaxe dotenv.

Se ADC depender de JSON de conta de serviço, preencher `GOOGLE_APPLICATION_CREDENTIALS` com o caminho absoluto para o arquivo protegido fora do repositório, conforme a configuração Firebase já aprovada. Sem essa variável, Firebase Admin usa ADC padrão disponível no ambiente do servidor. Não precisa repetir isso a cada análise. Proteger a pasta no Windows para acesso exclusivo ao usuário responsável; não usar pasta pública, sincronizada ou temporária.

O loader lê somente o arquivo explícito, resolve junctions/symlinks, recusa configuração dentro do repositório, recusa propriedades desconhecidas e não imprime conteúdos. Produção e emulador Firebase são bloqueados. Arquivo ausente, chave vazia, flags falsas, UID inválido ou limites inválidos não iniciam o modo real. O backend não carrega `.env` do repositório. A validação das credenciais na plataforma ocorre somente quando o responsável fizer o teste; testes falsos não comprovam acesso real da conta.

## Iniciar e usar — dois terminais na raiz

Backend:

```powershell
npm run receipts:backend
```

O comando compila o TypeScript e executa um único Node, sem watcher/respawn, em **127.0.0.1:3002**. O evento `receipt_local_listening` confirma host/porta, sem UID ou segredos. Para uma localização externa diferente: `npm run receipts:backend -- --config "C:\caminho-protegido\backend.env"`. Manter uma única instância operacional e a mesma pasta de estado; não trocar de diretório para renovar limites.

Aplicativo Web:

```powershell
npm run receipts:web
```

O comando inicia Expo Web em `http://localhost:8081`, com `backend-real` e API `http://127.0.0.1:3002`, sem ler `.env` privado. Não é necessário alterar o padrão mock dos comandos normais. O launcher remove variáveis de credenciais do ambiente passado ao Metro/ADB; a chave do arquivo externo só é lida pelo backend. O modo permanece bloqueado em builds de produção.

Entrar na conta autorizada → **+ / Novo Lançamento → Importar nota fiscal → Escolher arquivo** → selecionar JPG/JPEG/PNG/PDF suportado. A seleção inicia a solicitação real, após o aviso de envio ao servidor/OpenAI. O aplicativo obtém automaticamente `auth.currentUser.getIdToken()` e envia o Bearer para a rota. Aguardar a conferência, revisar descrição/total/tipo/categoria e corrigir se necessário. Selecionar categoria válida quando ausente. Clicar **Salvar** para gravar no Firestore pelo handler original, confirmando o lançamento na lista. Nenhum retorno da OpenAI salva automaticamente.

O backend atual não consulta categorias no Firestore: por isso um resultado aproveitável tende a ser `partial`, sem categoria. Isso permite completar o lançamento no aplicativo. Rejeição/inconclusão continuam sem campos aplicáveis; não alterar regras para aceitar documentos incompatíveis. Uma nota fiscal não comprova a perspectiva de entrada/saída: tipo ausente/inferido precisa de revisão manual. Data extraída é somente informativa e não altera data/competência.

## Android sem expor o backend na rede

Requer Android SDK Platform Tools (`adb`) no PATH, emulador ou aparelho USB autorizado e Expo Go/ambiente Expo já compatível. Com mais de um dispositivo, definir `ANDROID_SERIAL` para o dispositivo escolhido. Não instala ADB automaticamente.

```powershell
npm run receipts:android
```

O launcher executa `adb reverse tcp:3002 tcp:3002` e `adb reverse tcp:8081 tcp:8081`, depois inicia Expo Android em localhost. A URL da API permanece `127.0.0.1:3002` no aparelho, encaminhada para o computador. Isso contempla câmera, seleção nativa e multipart existentes, sem ampliar o bind do backend para LAN. Falha do ADB interrompe a inicialização; conferir conexão USB/permissão/PATH. Não usar essa entrada por Wi-Fi/Expo tunnel. Não usar Expo Web e Android simultâneos na mesma porta; encerrar um antes de iniciar o outro.

Se a porta da API precisar mudar, alterar `PORT` no arquivo externo e, no terminal frontend, definir `EXPO_PUBLIC_API_URL=http://127.0.0.1:NOVA_PORTA` antes do comando. O launcher Android encaminha essa porta. A porta do Expo é 8081 para coincidir com as origens CORS locais permitidas.

## Salvaguardas e custo

- Ativação pelo comando dedicado + duas flags explícitas externas. `npm run web`/`start` continuam mock por padrão; entradas tradicionais do backend continuam recusando modo real. O piloto conserva suas regras e trava consumida. Seu orçamento declarativo não é usado para habilitar o novo perfil.
- Firebase ID token verificado pelo SDK oficial, incluindo revogação, e UID único autorizado. Não há endpoint de liberação, UID vindo do corpo ou bypass de autenticação. CORS permite apenas Web localhost/127.0.0.1:8081; Android usa o mesmo endpoint loopback e Bearer, sem depender de CORS.
- Padrões operacionais: **2 uploads/minuto, 5 uploads/dia UTC por UID, concorrência global e por UID 1**. Faixas configuráveis: 1–5/minuto e 1–10/dia. Uploads inválidos também consomem quota em memória. Uma segunda instância na mesma porta falha; os limites de concorrência/minuto exigem um processo único, não são distribuídos.
- Antes do envio ao provedor, o modo local cria atomicamente um slot em `operational-attempts` ao lado do `backend.env`. Até o limite diário, arquivos `local-AAAA-MM-DD-N.attempt` contêm somente versão fixa, sem UID, documento ou segredo. `wx` + sincronização impedem reutilizar slots; uma nova instância mantém o limite de tentativas do provedor daquele dia, inclusive após erro, timeout ou cancelamento. Um novo dia UTC tem novos slots; nenhum histórico é apagado automaticamente. Erro de acesso/escrita bloqueia o envio. Não mover/apagar o estado para contornar limites.
- Upload até 10 MiB, JPG/PNG reais e PDF até três páginas; limites de pixels e validação isolada existentes. Token/chave não vão para workers. O documento permanece disponível até o transporte terminar e depois é descartado pelo ciclo existente.
- Retries de SDK/aplicação continuam zero. Padrões: provedor 25 s, consumidor 30 s, cliente real 75 s (inclui autenticação/upload/validação). O cliente pode cancelar; isso descarta aplicação tardia, mas não comprova interrupção remota nem ausência de cobrança.
- Métricas `receipt_local_metrics`: modelo, status, duração, tokens/cache e estimativa; usage ausente/inválido fica explicitamente desconhecido. Sem documento, campos fiscais, chave ou token em logs. O valor é estimativa, não fatura.

**O limite diário é de tentativas, não de dólares.** Não há teto monetário garantido por variável declarativa. Configurar os controles de gasto aplicáveis na conta/projeto OpenAI e supervisionar o teste; custos variam com entrada/saída. Não foi acessada conta nem alterado limite da plataforma nesta entrega. Produção/escala/retenção exigem infraestrutura e revisão específicas.

Encerrar backend e Expo com Ctrl+C. Sem watcher, o backend não reinicia sozinho. Para desativar posteriormente, manter ambas as flags falsas no arquivo externo e encerrar o processo já iniciado; editar o arquivo não altera processo em execução. Não apagar a trava do piloto nem os slots consumidos.

## Diagnóstico do primeiro uso

- Backend não inicia: conferir arquivo externo, flags, UID/projeto, chave, prazos/limites e porta; não imprimir segredos para depurar. ADC pode falhar apenas na primeira autenticação real, com HTTP 503.
- 401/403: entrar novamente/verificar o UID da conta e projeto Firebase no arquivo externo. Não copiar tokens.
- 429: aguardar janela/minuto/dia UTC correspondente; não reiniciar para tentar renovar o limite persistente.
- Erro de conexão: confirmar `receipt_local_listening`, `http://localhost:8081` e API loopback; Android precisa dos dois reverse ADB. Página HTTPS chamando HTTP é bloqueada pelo navegador.
- HTTP 200 rejeitado/inconclusivo: a integração concluiu uma decisão documental. Nenhum campo é inventado. Conferir se o arquivo é uma nota legível e compatível.

## Verificações sem chamadas pagas

`receiptLocal.test.cjs` cobre a entrada nova com SDK falso, autenticação injetada, parsers reais, frontend Web/multipart, resposta/patch, origem real, rejeição, inconclusão, falhas, CORS, limites persistentes/concorrência, timeout/cancelamento, loader externo e planos dos launchers. SDK/rede externa são bloqueados, e os workers reutilizam a guarda de I/O. Diretórios temporários de fixtures não são configurações ou marcadores operacionais do usuário.

```powershell
node --test tests/receiptLocal.test.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node financeiq-api/node_modules/typescript/bin/tsc --noEmit -p financeiq-api/tsconfig.json
git diff --check
```

O fluxo está ligado de ponta a ponta para o teste manual autorizado pelo responsável. Permanecem externos: preencher a configuração protegida uma vez, credenciais/conta efetivamente válidas, documento legítimo revisado e validação manual de browser/aparelho/Firestore. Não se afirma que o teste real já foi realizado nesta implementação.

Resultado automatizado da entrega: **492 testes aprovados (477 anteriores + 15 novos)**, sem falhas/cancelamentos/ignorados. TypeScript frontend/backend, compilação do backend, `git diff --check`, sintaxe do launcher Node e os cinco blocos PowerShell (somente parsing, sem execução) passaram. Exportação de desenvolvimento Web/Android com `backend-real` e endpoint loopback passou em `dist/receipts-local-development`, sem dotenv privado, com Expo offline e telemetria desativada. Nenhum servidor com credencial real foi iniciado e nenhum piloto pago foi repetido.
