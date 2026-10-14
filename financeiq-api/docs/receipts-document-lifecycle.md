# Etapa 5A — posse temporária e ciclo de vida documental

## Diagnóstico e correção

Antes, `receiptUpload.ts` validava e descartava `upload.bytes` em `finally`, liberava a reserva e só então executava `next()`/controller. O adaptador não poderia receber os bytes nesse controller.

Agora: autenticação Firebase → autorização do piloto → reserva/quota → multipart → validação isolada → consumidor interno opcional aguardado → descarte → liberação da reserva → resposta. O consumidor é injetado exclusivamente em código como terceiro argumento de `createReceiptUpload`; não vem de corpo, query ou configuração do cliente.

O controller e a rota públicos não foram alterados. Na entrada de produção não existe consumidor instalado; um documento válido continua retornando **501 / RECEIPT_ANALYSIS_NOT_IMPLEMENTED**. Nenhuma interpretação simulada é devolvida ao cliente. Não há integração de frontend ou execução do adaptador OpenAI.

## Contrato interno

`ReceiptDocumentConsumer(document, signal): Promise<void>` é executado somente depois que o processo validador confirma sucesso. O MIME é derivado do formato cuja assinatura e decodificação foram verificadas; não é repassado cegamente do cliente. O documento possui:

- `format`: jpeg, png ou pdf.
- `mimeType`: image/jpeg, image/png ou application/pdf.
- `size`: tamanho em bytes.
- `readBytes()`: empréstimo do buffer original, sem cópia adicional.

O documento não contém filename, URI, UID, credenciais ou dados de autorização. Não é guardado em `res.locals`, sessão, cache ou estrutura global. Getters e `readBytes()` verificam o escopo; acesso após finalização/cancelamento lança `DOCUMENT_ACCESS_CLOSED`. O handle é congelado e sua referência interna ao upload é removida no encerramento.

**Propriedade:** o middleware é dono do buffer. O consumidor pode lê-lo enquanto autorizado, mas não pode modificá-lo, retê-lo, persistir, criar cópias duradouras ou repassá-lo a tarefas independentes. A Promise retornada deve abranger TODO o trabalho e a limpeza assíncrona, inclusive de transports/workers criados pelo próprio consumidor. Não há reabertura de arquivo ou novo upload.

O consumidor de prova é inteiramente sintético, definido nos testes: verifica bytes/MIME, aguarda gates assíncronos e simula sucesso, falha, timeout e cancelamento. Ele não é instalado na rota padrão e não utiliza OpenAI.

## Timeout, cancelamento e encerramento

`RECEIPT_PROCESSING_TIMEOUT_MS` adiciona um prazo exclusivo do consumidor, padrão 15000 ms e máximo 45000 ms. Configuração inválida falha fechada. Não altera os limites de upload (20 s padrão), validação (8 s padrão), bytes, páginas, quotas ou concorrência. Só tem efeito com consumidor interno instalado.

Desconexão (`aborted`/`close`) ou prazo do consumidor expirado abortam o sinal e revogam imediatamente novos acessos pelo handle. O código **não** usa Promise.race para abandonar o consumidor: aguarda sua Promise assentar antes de zerar o buffer e liberar a reserva. Mesmo se o consumidor terminar com sucesso após o cancelamento, isso resulta em 504, não em 501. Se o cliente já desconectou, não tenta escrever resposta.

No caminho normal o sinal não é abortado artificialmente após sucesso, evitando disparar callbacks assíncronos de cancelamento depois que a Promise já terminou. A revogação do handle ocorre independentemente do estado do sinal. O consumidor é responsável por remover seus próprios listeners/timers em seu `finally`.

Após o consumidor terminar ou rejeitar, o `finally` do middleware remove timers/listeners, zera o buffer próprio, solta referências e chama `release()` uma vez. Quotas de uso continuam consumidas pelas tentativas admitidas, inclusive canceladas/rejeitadas; não são devolvidas. Somente a reserva de concorrência é liberada.

Erros sem objeto (`throw undefined`, `null`, `false` ou `0`) também são tratados como falha, sem promoção indevida a 501. Erros desconhecidos continuam usando o envelope 503 já existente, sem conteúdo bruto. O timeout/cancelamento do consumidor usa 504 / `DOCUMENT_PROCESSING_CANCELLED_OR_TIMED_OUT`; o formato público do envelope não mudou.

O validador mantém sua reserva até `close` do processo filho. Falha de inicialização, saída inesperada, erro assíncrono de IPC e throw síncrono de `child.send` são falhas operacionais. `send` síncrono antes deixaria a Promise rejeitar cedo, com o filho ainda vivo; agora solicita encerramento e aguarda `close`. Se solicitar kill falhar, também não declara que o worker terminou. Eventos repetidos de fechamento não duplicam a finalização.

## Garantias e limites efetivos

Esta API é para **consumidores internos confiáveis e cooperativos**. JavaScript no mesmo processo não permite interromper arbitrariamente uma função, impedir cópias feitas por ela nem desfazer tarefas que ela destacou. Uma Promise resolvida pelo consumidor é sua confirmação contratual de que o trabalho e a limpeza terminaram.

Se o consumidor ignorar abort e nunca assentar, a operação mantém a reserva ocupada e não envia resposta prematura. Isso preserva segurança de concorrência, mas pode indisponibilizar capacidade; não existe garantia de prazo rígido para código não cooperativo no mesmo processo. Consumidores desse tipo devem ser recusados ou executados em processo terminável, com supervisão do SO. Falha permanente de encerramento de um worker também exige supervisão: timeout não é prova de término. O processamento atual da rota padrão não instala esse tipo de consumidor.

Uma referência Buffer obtida antes do cancelamento não pode ser magicamente revogada pelo Node. Ela permanece emprestada até a confirmação de término e fica zerada pelo proprietário antes da liberação/resposta; novos acessos pelo handle já estão proibidos. Cópias feitas pelo consumidor, bibliotecas nativas, IPC e memória gerenciada não têm apagamento absoluto garantido. Não alegamos Zero Data Retention nem eliminação física de toda cópia.

O adaptador da Etapa 4 **não foi conectado nem modificado**. Sua política atual pode encerrar a espera antes de um double de transporte ignorando abort terminar. Uma futura ponte deverá manter o consumidor ativo até o transporte confirmar encerramento ou seu processo terminar; não basta assumir que retornar do adaptador prova quiescência. Isso pode ser feito no `finally` do consumidor, mantendo este mesmo ciclo de vida. Transporte real, revisão no app e ativação continuam dependendo de aprovação.

Nenhuma dependência, serviço externo ou infraestrutura foi criada. Autenticação, validação real de imagens/PDFs, worker sem credenciais, produção bloqueada sem controle distribuído e ausência de persistência permanecem iguais.

## Verificação e teste HTTP local

`tests/receiptDocumentLifecycle.test.cjs` utiliza documentos sintéticos, parsers reais, consumidor simulado e doubles de falhas do worker. A regressão anterior cobre também endpoints antigos, 401/403, formatos, quotas e isolamento. A suíte do consumidor bloqueia rede/escrita durante sua execução local; testes HTTP usam somente loopback e autenticação substituída em código.

Executar na raiz: `node --test tests/*.test.cjs`. Validar backend com o compilador instalado e `--noEmit -p financeiq-api/tsconfig.json`.

O teste HTTP manual continua exatamente como em [receipts-upload.md](receipts-upload.md#teste-http-local-sem-expor-token): habilitar modo local, configurar projeto/UID autorizado no ambiente, gerar PNG sintético e usar o roteiro PowerShell com token em prompt oculto. O resultado continua sendo 501, sem campos financeiros. Esta etapa não alterou `.env` ou credenciais locais. Não é necessário habilitar consumidor ou chave OpenAI para esse teste.
