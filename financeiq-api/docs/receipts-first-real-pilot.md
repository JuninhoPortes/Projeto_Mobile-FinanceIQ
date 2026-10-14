# Etapa 6C.2 — preparação operacional do primeiro teste real

Este documento preserva o roteiro preparado na Etapa 6C.2, que não executou chamadas pagas. O registro posterior abaixo informa a conclusão da primeira tentativa real relatada pelo responsável. **Não repetir o roteiro nem rearmar a tentativa única.** Qualquer novo teste depende de autorização separada. O frontend mantém suas proteções atuais para respostas simuladas; esta revisão não cria credenciais, documento ou `.env` privado.

## Registro posterior — primeiro piloto real concluído

O responsável informou a conclusão da primeira chamada real após a entrega 6C.2. Este registro utiliza exclusivamente os resultados fornecidos, sem acessar documento, resposta bruta, logs privados, credenciais ou marcador operacional. A revisão que acrescenta este registro não executa chamadas ao provedor nem autoriza uma segunda tentativa. O roteiro abaixo permanece como histórico da preparação, não como instrução para repeti-lo; a trava de uso único deve permanecer intacta.

| Dado informado | Resultado |
| --- | --- |
| Endpoint | `POST /receipts/analyze` |
| HTTP | `200` |
| `isSimulated` | `false` |
| `status` do contrato compatível | `error` |
| `documentStatus` | `rejected` |
| Modelo | `gpt-5.4-mini-2026-03-17` |
| Duração | 3082 ms |
| Tokens de entrada / saída / cache | 3867 / 133 / 0 |
| Custo estimado informado | US$ 0,00349875 |

O documento era um PNG sintético com dois produtos, total de R$ 24,90 e identificação explícita de ausência de validade fiscal. O total é uma característica do documento de teste; não foi comprovado como campo extraído. O custo acima é estimativa, não confirmação de cobrança/fatura na plataforma.

**O resultado relatado comprova o funcionamento da integração com o provedor e a entrega de um resultado documental pelo backend. A extração de uma nota fiscal válida ainda não foi comprovada.** Uma análise concluída pode rejeitar o documento e continua sujeita às validações fiscais do servidor. Não se deve alterar prompt, classificações ou validação para fazer este sintético ser aceito.

A combinação HTTP 200 + `status: error` + `documentStatus: rejected` é intencional e já estava documentada para resultados documentais. `status` é o contrato compatível com a análise de formulário: `error` significa ausência de campos aplicáveis. `documentStatus` distingue rejeição de falha técnica; o status HTTP indica que a operação de análise concluiu. Uma recusa do modelo (`MODEL_REFUSAL`), resposta inválida ou erro do transporte segue outro caminho, com HTTP de erro.

No código, `rejected` pode ser derivado de `MULTIPLE_DOCUMENTS` ou de classificação `other` clara e legível (`INCOMPATIBLE_DOCUMENT`). Os dados fornecidos não incluem `assessment.reasonCodes` ou a classificação bruta; portanto, o motivo exato deste piloto não foi confirmado. A ausência declarada de validade fiscal é compatível com uma rejeição, mas essa explicação permanece hipótese. O backend não certifica autenticidade fiscal.

O [detalhamento do contrato e da revisão offline](receipts-route-validation.md#revisão-após-o-primeiro-piloto-real) descreve o fluxo completo, respostas parciais e inconclusivas. Nenhuma mudança de comportamento de produção foi necessária nesta revisão. Qualquer nova chamada exige autorização separada; o primeiro piloto não autoriza remover, trocar ou contornar a trava.

## Controles implementados

- `npm run start:receipt-pilot` executa somente `node dist/receiptPilotServer.js`, sem watcher, respawn ou carregamento de dotenv. A entrada convencional (`start`/`dev`) recusa `RECEIPT_ANALYSIS_MODE=real`; seu comportamento disabled/simulated foi preservado.
- A entrada do piloto exige `RECEIPT_PILOT_HOST=127.0.0.1` e usa esse endereço literal no listen. Host ausente, wildcard, localhost ou IPv6 são rejeitados. `PORT` aceita inteiro 0–65535 (0 reserva porta efêmera, útil nos testes; para operação, usar 3001).
- Exige desenvolvimento, controles `local-single-process`, exatamente um UID, projeto Firebase explícito, ausência de emulador e quotas explícitas 1/minuto, 1/dia e concorrência global 1. As validações reais de token, revogação e autorização por UID permanecem na rota.
- Modo real mantém todas as habilitações anteriores: flag `true`, orçamento declarado positivo, chave backend, modelo permitido e prazo do provedor menor que o do consumidor. Configuração incompleta não inicia o piloto real. Os padrões continuam `disabled` e `false`.
- O diretório da trava precisa existir, ser absoluto, acessível e ficar fora do repositório, inclusive após resolver junctions/symlinks. A aplicação não cria o diretório. Use armazenamento local persistente e ACL privada do usuário; não usar pasta temporária, compartilhamento de rede ou pasta sincronizada.
- O nome fixo é `receipt-openai-first-attempt.lock`. Marcador preexistente, mesmo vazio, impede iniciar o piloto real. Dois processos que iniciem antes de sua criação ainda disputam `open(..., 'wx', 0600)`: apenas um vence. Escreve-se somente `financeiq-receipt-pilot-v1` e sincroniza-se o arquivo antes de criar o cliente/enviar ao provedor.
- Erro de escrita/sincronização impede o envio. A autorização em memória também fica consumida. O marcador nunca é apagado automaticamente, nem após erro, cancelamento, timeout ou reinício. Não há endpoint de desbloqueio. Falha antes da criação do marcador não autoriza envio.
- A trava limita tentativas de envio ao provedor, não recepções HTTP. Autenticação, autorização e validação documental vêm antes dela. Upload inválido pode consumir a quota em memória sem consumir a trava. Isso não autoriza repetir o teste: interromper e investigar.
- Não há fallback para simulação. A reserva e os bytes continuam disponíveis até a Promise do transporte encerrar; os mecanismos anteriores de descarte não foram substituídos.

O marcador depende da integridade do disco e das permissões locais. Ele não impede um operador de removê-lo ou trocar de diretório deliberadamente. **Não apagar, mover, substituir nem escolher outro diretório para repetir o teste.** Nova tentativa exige nova autorização e preparação manual posterior, fora deste roteiro.

## Métricas e limites financeiros

O callback `onMetrics` está conectado à entrada do piloto. Uma linha JSON `receipt_pilot_metrics` contém somente modelo configurado, indicador de simulação, status, duração em ms, tokens de entrada/saída/cache e estimativa em USD. A linha de inicialização contém apenas evento, host e porta. Falhas de inicialização usam mensagem fixa, sem erro bruto.

`costStatus=estimated` indica estimativa pelas tarifas já existentes no adaptador; não é a fatura. Usage ausente/inválido deixa tokens/custo nulos e `costStatus=unknown`. Não interpretar como gasto zero. O logger usa uma lista explícita, sem serializar objetos arbitrários. Não registra UID, token, chave, nome do arquivo, bytes, base64, payload, resposta bruta nem campos fiscais. Os logs de métricas também distinguem uma execução simulada.

**`RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS` é uma declaração obrigatória, não um teto monetário efetivo.** A trava limita a quantidade de tentativas; quotas e `max_output_tokens` restringem uso, mas não garantem um valor final. Cancelar ou atingir timeout local não garante cancelamento remoto ou ausência de cobrança. Retries permanecem desativados no cliente e na chamada.

Antes da autorização, conferir projeto dedicado, acesso ao modelo configurado e tarifas aplicáveis. Segundo a [documentação oficial OpenAI sobre gastos](https://developers.openai.com/api/docs/guides/spend-limits), alertas apenas notificam; limites rígidos mensais de organização/projeto precisam de enforcement habilitado e ainda podem apresentar pequeno excedente durante propagação. Esses controles pertencem à plataforma e não são configurados pelo FinanceIQ. Não foram verificados em nenhuma conta nesta entrega.

## 1. Preparação sem credenciais — PowerShell, raiz do projeto

Não usar transcrição, gravação de terminal ou comandos que exibam todas as variáveis de ambiente. Usar duas janelas locais de PowerShell independentes, sem herdar a chave do backend na janela cliente. Não usar `setx`, argumentos de linha de comando para segredos, `EXPO_PUBLIC_` ou arquivos no repositório.

```powershell
git branch --show-current
git log -1 --oneline
git status --short
node --version
npm ls --prefix financeiq-api --depth=0
node --test tests/receiptPilot.test.cjs
if ($LASTEXITCODE -ne 0) { throw 'Testes falharam.' }
npm run build --prefix financeiq-api
if ($LASTEXITCODE -ne 0) { throw 'Build falhou.' }
```

Conferir branch `feat/leitura-notas-openai` e a revisão aprovada após a 6C.2. Revisar alterações pendentes antes do teste; não mudar branch/commit neste roteiro. Dependências precisam estar disponíveis. Se faltarem, parar para resolver separadamente; não instalar automaticamente. Encerrar outros processos da API e qualquer watcher; não usar túnel, proxy reverso ou encaminhamento de porta.

Preparar futuramente um PNG/JPG legível, de uma página, abaixo dos limites existentes (10 MiB, 20 milhões de pixels, dimensões até 10000). Exemplo de conteúdo: estabelecimento fictício `Mercado Aurora de Testes`, descrição `Compra de alimentos`, total `R$ 24,90`, moeda BRL e data `14/10/2026`. Sem CPF, CNPJ, endereço, QR code, conta ou dados financeiros reais. Identificar como documento sintético, sem simular validade fiscal real. Isso pode levar o modelo a classificá-lo como incompatível/inconclusivo: aceitar e inspecionar essa classificação, sem forçar aceitação ou repetir a chamada.

Se reconhecido como documento compatível e legível, esperar 2490 centavos, BRL, estabelecimento/descrição/data conforme o conteúdo. Identificadores ausentes devem permanecer ausentes. Tipo inferido e campos incertos não devem ser aplicados como claros. Sem fonte autorizada de categorias no backend, categoria permanece sem resolução; uma resposta parcial é normal. Não fabricar categoria para obter success.

## 2. Janela A — configurar o piloto ainda bloqueado

Os exemplos seguintes só devem ser preenchidos/executados depois da autorização futura. O UID não é token. Usar exatamente o UID da conta piloto autenticada. Credenciais Firebase por ADC já aprovadas no backend; se um arquivo for necessário, sua localização deve ser protegida e externa ao repositório. Não imprimir o conteúdo nem alterar autenticação para contornar falhas.

```powershell
$env:NODE_ENV = 'development'
$env:PORT = '3001'
$env:RECEIPT_PILOT_HOST = '127.0.0.1'
$env:FIREBASE_PROJECT_ID = Read-Host 'ID do projeto Firebase aprovado'
$env:RECEIPT_PILOT_UIDS = Read-Host 'UID piloto único aprovado'
$env:RECEIPT_LIMITS_MODE = 'local-single-process'
$env:RECEIPT_REQUESTS_PER_MINUTE = '1'
$env:RECEIPT_REQUESTS_PER_DAY = '1'
$env:RECEIPT_GLOBAL_CONCURRENCY = '1'
$env:RECEIPT_OPENAI_MODEL = 'gpt-5.4-mini-2026-03-17'
$env:RECEIPT_OPENAI_TIMEOUT_MS = '10000'
$env:RECEIPT_PROCESSING_TIMEOUT_MS = '15000'
$env:RECEIPT_UPLOAD_TIMEOUT_MS = '20000'
$env:RECEIPT_VALIDATION_TIMEOUT_MS = '8000'
$env:RECEIPT_OPENAI_MAX_OUTPUT_TOKENS = '2048'
$env:RECEIPT_ANALYSIS_MODE = 'disabled'
$env:RECEIPT_OPENAI_REAL_CALLS_ENABLED = 'false'
Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue

if (-not $env:LOCALAPPDATA) { throw 'Diretório persistente local indisponível.' }
$env:RECEIPT_OPENAI_PILOT_LOCK_DIR = Join-Path $env:LOCALAPPDATA 'FinanceIQ\receipt-openai-pilot'
# Executar somente após conferir localização e ACL no Windows.
[IO.Directory]::CreateDirectory($env:RECEIPT_OPENAI_PILOT_LOCK_DIR) | Out-Null
$pilotMarker = Join-Path $env:RECEIPT_OPENAI_PILOT_LOCK_DIR 'receipt-openai-first-attempt.lock'
if (Test-Path -LiteralPath $pilotMarker) { throw 'Tentativa já consumida. Não remover o marcador.' }
if ($env:RECEIPT_PILOT_UIDS -match '[\s,*]' -or [string]::IsNullOrWhiteSpace($env:RECEIPT_PILOT_UIDS)) { throw 'Exige UID único.' }

node financeiq-api/dist/receiptPilotServer.js
```

A inicialização deve mostrar somente `127.0.0.1:3001`. Enquanto esse processo estiver ativo, conferir na janela B:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 3001 |
    Select-Object LocalAddress, LocalPort, OwningProcess
```

Confirmar um único processo Node e `LocalAddress=127.0.0.1`, sem 0.0.0.0 ou `::`. O modo disabled não inicia transporte nem cria marcador; com upload válido e autenticado retornaria 501, mas não é necessário enviar documento nesta conferência. A suíte offline já comprova os bloqueios. Não enviar uma requisição real para testar se está bloqueado.

Pressionar Ctrl+C na janela A e aguardar retorno do prompt. Confirmar na janela B que a porta não tem mais listener. Não continuar se houver processo pendente. A configuração do transporte é capturada na inicialização: mudar variáveis na janela não desativa um Node já iniciado.

## 3. Janela A — única execução real futura

Só após autorização expressa para o teste pago, conferência dos limites na plataforma, ADC Firebase e documento sintético revisado. O modelo foi preservado; disponibilidade e permissão da conta não foram testadas. Não executar chamadas adicionais de sondagem ao provedor.

```powershell
if (Test-Path -LiteralPath $pilotMarker) { throw 'Tentativa já consumida. Parar.' }
$env:RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS = Read-Host 'Orçamento aprovado em centavos de USD (declaração, não teto)'
$pilotSecret = Read-Host 'Chave do projeto OpenAI dedicado (entrada oculta)' -AsSecureString
$pilotBstr = [IntPtr]::Zero
try {
    $pilotBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pilotSecret)
    $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pilotBstr)
} finally {
    if ($pilotBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pilotBstr) }
    $pilotSecret.Dispose()
    Remove-Variable pilotSecret, pilotBstr -ErrorAction SilentlyContinue
}

try {
    $env:RECEIPT_ANALYSIS_MODE = 'real'
    $env:RECEIPT_OPENAI_REAL_CALLS_ENABLED = 'true'
    node financeiq-api/dist/receiptPilotServer.js
} finally {
    # Só alcançado após a saída do Node; isso não cancela processamento remoto.
    $env:RECEIPT_ANALYSIS_MODE = 'disabled'
    $env:RECEIPT_OPENAI_REAL_CALLS_ENABLED = 'false'
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Remove-Item Env:RECEIPT_OPENAI_TEST_BUDGET_USD_CENTS -ErrorAction SilentlyContinue
}
```

Não reiniciar após bloqueio, erro ou resultado duvidoso. Na janela B, conferir novamente o listener antes do único POST. O cliente não recebe a chave da OpenAI.

## 4. Janela B — exatamente um POST autenticado, sem retry

Obter um **Firebase ID token vigente** da conta piloto por procedimento já aprovado; não usar custom token, emulador ou atalho de UID. Não colar tokens em comandos, histórico ou mensagens. O script abaixo mantém o token apenas em memória, não segue redirect nem usa proxy/cookies. Seu timeout de 60 s inclui upload/validação/processamento; não repete após falha.

```powershell
Add-Type -AssemblyName System.Net.Http
$pilotFile = Read-Host 'Caminho absoluto do PNG/JPG sintético revisado'
if (-not [IO.File]::Exists($pilotFile)) { throw 'Arquivo ausente.' }
$pilotMime = switch ([IO.Path]::GetExtension($pilotFile).ToLowerInvariant()) {
    '.png' { 'image/png' }
    '.jpg' { 'image/jpeg' }
    '.jpeg' { 'image/jpeg' }
    default { throw 'Usar PNG/JPG sintético neste primeiro teste.' }
}
$pilotTokenSecret = Read-Host 'Firebase ID token (entrada oculta)' -AsSecureString
$pilotTokenBstr = [IntPtr]::Zero
$pilotHttp = $null; $pilotHandler = $null; $pilotRequest = $null; $pilotResponse = $null
$pilotBody = $null; $pilotFileContent = $null; $pilotStream = $null
try {
    $pilotTokenBstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($pilotTokenSecret)
    $pilotHandler = [Net.Http.HttpClientHandler]::new()
    $pilotHandler.AllowAutoRedirect = $false
    $pilotHandler.UseProxy = $false
    $pilotHandler.UseCookies = $false
    $pilotHttp = [Net.Http.HttpClient]::new($pilotHandler)
    $pilotHttp.Timeout = [TimeSpan]::FromSeconds(60)
    $pilotRequest = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, 'http://127.0.0.1:3001/receipts/analyze')
    $pilotRequest.Headers.Authorization = [Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pilotTokenBstr))
    $pilotStream = [IO.File]::OpenRead($pilotFile)
    $pilotFileContent = [Net.Http.StreamContent]::new($pilotStream)
    $pilotFileContent.Headers.ContentType = [Net.Http.Headers.MediaTypeHeaderValue]::new($pilotMime)
    $pilotBody = [Net.Http.MultipartFormDataContent]::new()
    $pilotBody.Add($pilotFileContent, 'document', ('synthetic' + [IO.Path]::GetExtension($pilotFile)))
    $pilotRequest.Content = $pilotBody
    $pilotWatch = [Diagnostics.Stopwatch]::StartNew()
    # Única instrução de envio. Nunca colocar em loop, retry ou rodar novamente.
    $pilotResponse = $pilotHttp.SendAsync($pilotRequest).GetAwaiter().GetResult()
    $pilotWatch.Stop()
    $pilotResult = $pilotResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
    [pscustomobject]@{ HttpStatus = [int]$pilotResponse.StatusCode; DurationMs = $pilotWatch.ElapsedMilliseconds; Status = $pilotResult.status; DocumentStatus = $pilotResult.documentStatus; Code = $pilotResult.code; IsSimulated = $pilotResult.isSimulated }
    # Inspeção local do resultado validado, só porque este documento é sintético.
    # Não registrar resposta inteira, headers ou tokens em arquivo/transcrição.
    $pilotResult.fields | Format-List
} catch {
    Write-Host 'Tentativa encerrada sem resultado verificável. Não repetir; conferir servidor, marcador e usage.'
} finally {
    if ($pilotTokenBstr -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pilotTokenBstr) }
    $pilotTokenSecret.Dispose()
    if ($pilotRequest) { $pilotRequest.Headers.Authorization = $null }
    foreach ($pilotResource in @($pilotResponse, $pilotRequest, $pilotBody, $pilotFileContent, $pilotStream, $pilotHttp, $pilotHandler)) {
        if ($pilotResource) { $pilotResource.Dispose() }
    }
    Remove-Variable pilotTokenSecret, pilotTokenBstr, pilotRequest, pilotResponse, pilotBody, pilotFileContent, pilotStream, pilotHttp, pilotHandler, pilotResource -ErrorAction SilentlyContinue
}
```

JPG/PNG/PDF continuam suportados pela implementação; escolher apenas uma imagem simples reduz variáveis no primeiro teste. Não enviar PDF adicional para comparar nesta tentativa.

## 5. Conferência, encerramento e limpeza

Na janela A, inspecionar a linha `receipt_pilot_metrics`: modelo, status, duração, tokens/cache, `estimatedCostUsd` e `costStatus`. Conferir o marcador com `Test-Path -LiteralPath $pilotMarker`; após chegar ao provedor ele deve existir. Não é preciso exibir seu conteúdo. Uma falha antes de enviar pode não emitir métrica nem criar marcador; mesmo assim parar e investigar antes de qualquer nova execução.

Comportamento HTTP preservado: documento analisado retorna 200, inclusive partial/rejected/inconclusive, com `isSimulated=false`, sem mensagem demonstrativa. Categoria pode ficar ausente e requerer revisão. Falha operacional retorna 503, limite do provedor 429 e timeout 504; não retorna campos inventados. Cancelamento do cliente pode não entregar resposta. Erros anteriores ao adaptador mantêm os contratos de autenticação/upload e podem não incluir `isSimulated`. Nenhum resultado salva lançamento.

Assim que concluir a única tentativa, pressionar Ctrl+C na janela A e aguardar Node encerrar; o finally remove chave/orçamento e desativa flags no ambiente pai. Verificar ausência do listener na janela B. Se o processo não encerrar, interromper a operação e investigar; não iniciar outra instância. Encerramento forçado não comprova cancelamento remoto. Confirmar que nenhum watcher reiniciou o backend.

Limpar variáveis restantes na janela A, preservando o marcador no disco:

```powershell
Get-ChildItem Env: | Where-Object { $_.Name -like 'RECEIPT_*' } |
    ForEach-Object { Remove-Item -LiteralPath ('Env:' + $_.Name) }
$env:RECEIPT_ANALYSIS_MODE = 'disabled'
$env:RECEIPT_OPENAI_REAL_CALLS_ENABLED = 'false'
Remove-Item Env:OPENAI_API_KEY, Env:FIREBASE_PROJECT_ID, Env:GOOGLE_APPLICATION_CREDENTIALS -ErrorAction SilentlyContinue
Remove-Variable pilotMarker -ErrorAction SilentlyContinue
```

Fechar as duas janelas após a inspeção para eliminar referências em memória (objetos gerenciados não oferecem apagamento absoluto). Revogar a chave dedicada usada no teste pela plataforma, sem copiá-la para logs. Na plataforma OpenAI, filtrar o projeto e intervalo do teste em Usage/Costs, conferir requisições/tokens e custo efetivamente registrado; aguardar atualização se necessário. Não consultar APIs administrativas usando outra chave neste roteiro. Comparar com a estimativa local; custo desconhecido exige conferência externa, nunca uma nova chamada para medir. Confirmar `git status --short` sem credenciais/documentos acrescentados.

O piloto não resolve controles distribuídos, retenção em produção ou risco de processos locais maliciosos. `store:false` não deve ser interpretado como garantia de retenção zero. Na entrega original 6C.2, autorização paga, acesso da conta/modelo, ADC, documento e validação manual ainda estavam pendentes. O registro posterior no início deste documento informa o resultado da primeira tentativa; não comprova extração fiscal válida nem libera novas chamadas.

## Verificações offline da entrega

`tests/receiptPilot.test.cjs` usa somente cliente falso e tokens sentinela, bloqueia SDK/rede externa e cobre fluxo HTTP, localhost, configuração insegura, logs, usage, travas entre instâncias/processos, reinício, quotas, erro, timeout, cancelamento e modos anteriores. O helper de processo também bloqueia rede; workers documentais usam a guarda de I/O dos testes existentes. Diretórios temporários e marcadores desses testes são descartados apenas pelo harness, que não remove marcador operacional.

```powershell
node --test tests/receiptPilot.test.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node financeiq-api/node_modules/typescript/bin/tsc --noEmit -p financeiq-api/tsconfig.json
git diff --check
git status --short
```
