# Upload documental — Etapa 3

## Fluxo e contrato

`POST /receipts/analyze`: Bearer → verificação Firebase → piloto por UID → quota e concorrência → multipart → validação isolada → consumidor interno opcional aguardado → descarte → HTTP 501. A rota padrão não instala consumidor. Autenticação e autorização da Etapa 2 não foram alteradas. Consulte o [ciclo de vida da Etapa 5A](receipts-document-lifecycle.md) para posse temporária e garantias de encerramento.

Enviar exatamente um arquivo no campo `document`, sem campos textuais. JPG/JPEG (`image/jpeg`), PNG (`image/png`) e PDF (`application/pdf`). Extensão, MIME e assinatura real devem concordar; divergências são rejeitadas. Nenhuma URL é aceita. Tamanho e contagem são verificados durante streaming, inclusive sem Content-Length.

| HTTP | Exemplos de `code` |
| --- | --- |
| 400 | `INVALID_MULTIPART`, `DOCUMENT_REQUIRED`, `UNEXPECTED_FILE`, `TOO_MANY_FILES`, `UNEXPECTED_FIELD`, `MULTIPART_HEADERS_LIMIT` |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_DOCUMENT_FORMAT`, `SIGNATURE_MISMATCH` |
| 422 | `EMPTY_DOCUMENT`, `INVALID_IMAGE`, `IMAGE_OUTSIDE_POLICY`, `INVALID_PDF`, `PROTECTED_PDF`, `PDF_PAGE_LIMIT`, `INVALID_DOCUMENT` |
| 429 | `RECEIPT_USAGE_LIMIT` (inclui Retry-After de 60 segundos; quota diária pode exigir esperar o próximo dia) |
| 503 | `UPLOAD_CONTROLS_UNAVAILABLE`, `DOCUMENT_VALIDATION_UNAVAILABLE`, `UPLOAD_UNAVAILABLE` |
| 504 | `UPLOAD_CANCELLED_OR_TIMED_OUT`, `DOCUMENT_VALIDATION_TIMEOUT` |
| 501 | `RECEIPT_ANALYSIS_NOT_IMPLEMENTED`: arquivo válido, ainda sem interpretação |

Envelope preservado: `{ "error": true, "code": "…", "message": "…" }`, sem campos financeiros. 401/403/503 de autenticação permanecem iguais. Uma desconexão pode impedir o envio de qualquer resposta; os recursos ainda são liberados.

Esta etapa confirma formato e estrutura, não se o documento é fiscal, autêntico ou legível para extração. A política fiscal da Etapa 1 será aplicada somente na interpretação futura.

## Configuração do piloto local

O upload fica indisponível por padrão. Para uma única aplicação, em um único processo local, configure `RECEIPT_LIMITS_MODE=local-single-process` no ambiente do backend, além do projeto Firebase e da lista piloto. `NODE_ENV=production` bloqueia esse modo com 503. Valores inválidos ou modo desconhecido também falham fechados. Não há fallback ilimitado.

| Variável | Padrão | Teto configurável nesta versão |
| --- | --- | --- |
| `RECEIPT_MAX_FILE_BYTES` | 10485760 (10 MiB) | 10485760 |
| `RECEIPT_MAX_PDF_PAGES` | 3 | 3 |
| `RECEIPT_MAX_IMAGE_WIDTH` | 10000 | 12000 |
| `RECEIPT_MAX_IMAGE_HEIGHT` | 10000 | 12000 |
| `RECEIPT_MAX_IMAGE_PIXELS` | 20000000 | 20000000 |
| `RECEIPT_REQUESTS_PER_MINUTE` | 5 | 100 |
| `RECEIPT_REQUESTS_PER_DAY` | 30 | 10000 |
| `RECEIPT_GLOBAL_CONCURRENCY` | 4 | 4 |
| `RECEIPT_UPLOAD_TIMEOUT_MS` | 20000 | 60000 |
| `RECEIPT_VALIDATION_TIMEOUT_MS` | 8000 | 15000 |
| `RECEIPT_PROCESSING_TIMEOUT_MS` | 15000 | 45000 (somente consumidor interno, cancelamento cooperativo) |

Todos os valores são inteiros positivos configurados pelo servidor. Uma operação simultânea por UID. Quota de minuto usa janela móvel de 60 segundos; quota diária usa UTC. Toda tentativa autenticada/autorizada admitida consome quota, incluindo documento inválido ou cancelamento. Negação por concorrência não consome nova quota. O mapa possui teto de 1000 UIDs; saturação nega novas identidades. Reiniciar o processo perde os contadores: este modo não é adequado à produção ou múltiplas instâncias, mesmo que compartilhem o mesmo servidor.

Multipart: um arquivo, nenhum campo textual, até duas partes (a segunda é rejeitada), até oito cabeçalhos de parte, bloco inicial de cabeçalhos até 2048 bytes incluindo boundary, Content-Type HTTP até 200 caracteres e envelope total até arquivo + 8192 bytes. Os nomes esperados são fixos; filename é usado apenas para checar extensão e nunca registrado. Erros fecham a conexão após enviar resposta, sem drenar um corpo arbitrário.

## Isolamento e descarte

Upload em memória, limitado antes da criação de qualquer processo validador. Um filho Node descartável valida cada documento; heap V8 limitado a 128 MiB, prazo controlado pelo pai, Sharp com cache desativado e uma thread. Somente bytes, formato e limites são enviados por IPC. O ambiente do filho não herda credenciais Firebase, chaves ou NODE_OPTIONS. O worker precisa acompanhar a implantação: `financeiq-api/workers/receiptDocumentWorker.cjs` fica fora de `dist` e funciona tanto com ts-node quanto com o build compilado.

Imagens: assinatura/trailer, dimensões e número de frames; Sharp força decodificação com `failOn: warning` e limite de pixels. Não há OCR. PDFs: cabeçalho/trailer, carregamento PDF.js, permissões/criptografia, contagem e árvore de páginas. Senha não é solicitada. PDFs protegidos ou com avisos de recuperação/reparo são rejeitados conservadoramente. Não há renderização, execução de JavaScript do PDF nem extração de texto.

**Limitação de integridade:** esta é validação estrutural, não um verificador formal de todos os objetos e streams PDF não utilizados. Não garante que toda página possa ser renderizada corretamente posteriormente. A leitura futura deve manter isolamento, limites e rejeição diante de erro. Recursos desconhecidos não são executados nem reparados pelo FinanceIQ; avisos do parser causam rejeição.

Buffers próprios do upload e do filho são zerados quando possível; referências são soltas. O processo filho é encerrado também em cancelamento/timeout, e sua reserva só é liberada após fechamento. Não existe persistência, arquivo temporário, log de conteúdo ou envio documental a serviços externos. A limpeza não promete apagar cópias internas dos parsers/IPC ou memória do sistema; seu descarte é concluído com o término do filho. Falhas anteriores à validação também liberam a reserva, os listeners e os buffers acumulados.

O limite V8 não é um limite de memória nativa/RSS, e processo filho não é um sandbox completo. Produção deverá ter limites de memória/CPU/processos e bloqueio de saída de rede no nível do contêiner/SO. A concorrência de quatro processos deve ser dimensionada considerando Sharp/libvips, PDF.js, cópias IPC e os buffers de upload.

## Proposta para produção — não implementada

Antes de habilitar múltiplas instâncias, aprovar armazenamento compartilhado com operações atômicas (por exemplo, Redis). Uma operação Lua deve verificar e incrementar quotas por UID, janela móvel e dia, e adquirir leases por UID/global com identificador único. Usar tempo do servidor do armazenamento; em cluster, as chaves da operação precisam estar no mesmo hash slot. Release deve conferir o identificador para não liberar reserva de outra operação.

Leases precisam de expiração, renovação e política coordenada de encerramento dos workers antes de liberar capacidade. TTL sozinho pode permitir excesso se um processo ainda estiver vivo; exige supervisão e prazo máximo de execução. Indisponibilidade do armazenamento deve retornar 503, nunca recorrer a contadores locais. Também definir persistência, reinícios, limites de memória das chaves e monitoramento apenas operacional. Nenhuma infraestrutura foi criada nesta etapa e a rota continua bloqueada em produção.

## Teste HTTP local sem expor token

Gerar apenas um arquivo sintético na raiz do projeto (sem dados pessoais):

```powershell
node -e "require('./tests/helpers/receiptUploadFixtures.cjs').image().then(bytes => require('node:fs').writeFileSync('synthetic-receipt.png', bytes))"
```

Com o backend configurado para o piloto local e iniciado em outro terminal, digitar o ID token em prompt oculto. O exemplo usa .NET diretamente, evitando incluir o token na linha de comando de um processo externo ou no histórico:

```powershell
Add-Type -AssemblyName System.Net.Http
$receiptSecret = Read-Host 'Firebase ID token' -AsSecureString
$receiptCredential = New-Object System.Net.NetworkCredential('', $receiptSecret)
$receiptClient = New-Object System.Net.Http.HttpClient
$receiptClient.DefaultRequestHeaders.Authorization = New-Object System.Net.Http.Headers.AuthenticationHeaderValue('Bearer', $receiptCredential.Password)
$receiptForm = New-Object System.Net.Http.MultipartFormDataContent
$receiptFile = [System.IO.File]::OpenRead((Join-Path (Get-Location) 'synthetic-receipt.png'))
$receiptPart = New-Object System.Net.Http.StreamContent($receiptFile)
$receiptPart.Headers.ContentType = New-Object System.Net.Http.Headers.MediaTypeHeaderValue('image/png')
$receiptForm.Add($receiptPart, 'document', 'synthetic-receipt.png')
try {
  $receiptResponse = $receiptClient.PostAsync('http://127.0.0.1:3000/receipts/analyze', $receiptForm).GetAwaiter().GetResult()
  [int]$receiptResponse.StatusCode
  $receiptResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
} finally {
  if ($receiptResponse) { $receiptResponse.Dispose() }
  $receiptForm.Dispose()
  $receiptClient.Dispose()
  $receiptCredential = $null
  $receiptSecret.Dispose()
}
```

Esperado: 501 e `RECEIPT_ANALYSIS_NOT_IMPLEMENTED`. O token precisa pertencer a um UID autorizado. A geração do arquivo serve somente para teste local, não faz parte da persistência do endpoint. Não executar com transcrição de terminal habilitada.

Dependências autorizadas: `@fastify/busboy@3.2.3`, `sharp@0.35.5` e `pdfjs-dist@6.4.299`. Referências: [Busboy](https://github.com/fastify/busboy), [Sharp](https://sharp.pixelplumbing.com/api-constructor/) e [PDF.js](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html).
