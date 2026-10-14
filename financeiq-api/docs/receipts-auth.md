# Rota de notas fiscais — Etapas 2 e 3

`POST /receipts/analyze` autentica, autoriza e recebe um documento com validação binária temporária. Não interpreta conteúdo financeiro, não chama OpenAI, não usa os validadores de extração da Etapa 1 e não salva transações. O frontend ainda usa o mock existente. Consulte [upload e limites](receipts-upload.md) para habilitação local, campo multipart, políticas e teste HTTP.

## Configuração no servidor

- `FIREBASE_PROJECT_ID`: projeto que emite os ID tokens do frontend. O projeto atualmente declarado em `firebaseConfig.ts` é `teste-db34e`; confirme o ambiente de implantação antes de configurar.
- `RECEIPT_PILOT_UIDS`: lista de UIDs separados por vírgula, com correspondência exata e sensível a maiúsculas. Ausência ou lista vazia nega todos. `*` não habilita acesso geral: sua presença invalida toda a lista. Uma entrada com mais de 128 caracteres também invalida a lista.
- Credenciais via `applicationDefault()`. Prefira identidade gerenciada do ambiente, com acesso mínimo necessário ao Firebase Authentication. Não conceder permissões de escrita Firestore por causa desta rota.
- Quando o ambiente exigir arquivo de credenciais, configure `GOOGLE_APPLICATION_CREDENTIALS` para um arquivo protegido **fora** do repositório. Nunca colocar chave privada em `.env.example`, código, frontend, corpo HTTP ou logs. Esta etapa não cria credenciais ou arquivos de conta de serviço.
- Não configurar `FIREBASE_AUTH_EMULATOR_HOST`: o serviço rejeita esse modo, inclusive em desenvolvimento, para impedir aceitação de tokens sem assinatura. Testes automatizados substituem as funções do SDK por mocks; não existe variável para ignorar autenticação.
- Firebase Admin 14.5.0 requer Node.js 22 ou superior. O ambiente verificado utiliza Node.js 24.

Reinicie o processo após alterar a lista do piloto ou o projeto. A lista é capturada ao criar a aplicação; o app Firebase nomeado não é reutilizado se o projeto configurado divergir.

O Firebase Admin é inicializado de forma preguiçosa, somente após um cabeçalho Bearer aceitável. O app nomeado `financeiq-receipts` é reutilizado entre verificações; falhas de configuração não impedem o funcionamento das rotas anteriores.

## Autenticação e autorização

Enviar um único cabeçalho `Authorization: Bearer <Firebase ID token>` obtido pelo SDK cliente. Custom tokens, cookies, `userId`, token no corpo ou query string não substituem esse cabeçalho.

O SDK executa `verifyIdToken(token, true)`, incluindo verificação de assinatura, emissor, audiência, expiração, revogação e usuário desabilitado. A identidade é reduzida ao UID verificado e guardada em `res.locals.receiptIdentity`. Apenas essa identidade participa da autorização; corpo e query são ignorados.

A verificação de revogação requer comunicação com Firebase Authentication e credenciais administrativas válidas. Falhas operacionais não são confundidas com token válido nem expostas ao cliente. Nenhum token, credencial ou erro bruto é registrado pelo código novo.

## Resposta HTTP provisória

Todas as respostas da cadeia de autenticação possuem `Cache-Control: no-store` e o contrato:

```json
{
  "error": true,
  "code": "RECEIPT_ANALYSIS_NOT_IMPLEMENTED",
  "message": "A análise de notas fiscais ainda não foi implementada. Continue preenchendo manualmente."
}
```

| HTTP | `code` | Condição |
| --- | --- | --- |
| 401 | `AUTH_REQUIRED` | Token ausente, cabeçalho inválido/duplicado, token inválido, expirado, revogado ou usuário desabilitado/inexistente. Inclui `WWW-Authenticate: Bearer`. |
| 403 | `RECEIPT_ACCESS_DENIED` | Token verificado, mas UID não autorizado no piloto. |
| 503 | `AUTH_UNAVAILABLE` | Inicialização/configuração, modo emulador ou falha operacional do verificador. |
| 501 | `RECEIPT_ANALYSIS_NOT_IMPLEMENTED` | Autenticação, autorização e validação do documento válidas; interpretação ainda não implementada. |

O 501 é determinístico e nunca contém campos financeiros, UID, tokens ou dados simulados. Na Etapa 3, o parser multipart só é iniciado após autenticação, autorização e reserva de uso. Campos textuais e URLs não substituem o arquivo. Erros de upload e controles estão documentados em [upload e limites](receipts-upload.md).

## Preservação e testes

`createApp` separa a aplicação Express do `listen` para executar testes HTTP locais com o mesmo registro de rotas. A entrada de produção em `server.ts` usa o verificador real. A injeção de dependências é feita por código de teste, nunca por cabeçalho, corpo ou configuração de desenvolvimento.

As rotas `/health`, `/open-finance` e `/indicators`, seu parser JSON e o CORS global mantêm seus comportamentos. O middleware de autenticação não é global. Os testes de indicadores usam um double de Axios para não chamar APIs externas.

Executar a suíte completa na raiz:

```text
node --test tests/receiptAcquisitionService.test.cjs tests/receiptMockService.test.cjs tests/receiptFormService.test.cjs tests/receiptIntegration.test.cjs tests/receiptExtractionValidation.test.cjs tests/receiptAuth.test.cjs tests/receiptUpload.test.cjs
```

Checagem TypeScript no backend:

```text
tsc --noEmit -p financeiq-api/tsconfig.json
```

Os testes não usam credenciais reais nem validam o projeto implantado. A validação real de um ID token requer configuração segura do ambiente. A suíte de autenticação isola o upload com um middleware de teste; a suíte de upload executa os parsers reais, com verificador de token substituído em código. Nenhuma configuração permite ignorar tokens em produção. Controles distribuídos e interpretação permanecem pendentes; manter a lista do piloto vazia em ambientes públicos.

Referências: [inicialização e ADC](https://firebase.google.com/docs/admin/setup), [verificação de ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens) e [verificação de revogação](https://firebase.google.com/docs/auth/admin/manage-sessions).
