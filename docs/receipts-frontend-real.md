# Suporte do aplicativo à análise fiscal real

Atualização operacional: os [comandos de análise local](receipts-local.md) agora conectam o aplicativo a uma entrada real supervisionada própria, separada do piloto consumido. As pendências de operação local descritas ao final deste registro são históricas; produção continua bloqueada.

Base: branch `feat/leitura-notas-openai`, revisão pós-piloto `2f86d90`, 463 testes anteriores. O primeiro piloto real relatado concluiu a integração com HTTP 200, `isSimulated=false`, `documentStatus=rejected`, 3867 tokens de entrada, 133 de saída e custo estimado de US$ 0,00349875. Esse piloto não comprovou extração de nota fiscal válida. Esta implementação não faz outra chamada real, não acessa credenciais ou marcador operacional e não libera nova tentativa.

## Fluxo disponível

**Novo Lançamento → Importar nota fiscal → câmera/arquivo → carregamento → conferência dos campos → correção manual → Salvar.** O adaptador HTTP, token Firebase, multipart nativo/Web, formulário e serviço de preparação de campos são os mesmos já existentes. Não há SDK OpenAI, chave do provedor ou chamada direta ao provedor no aplicativo.

`receiptBackendResponseService` agora valida respostas reais e simuladas por um único mecanismo. `parseSimulatedReceiptResponse` permanece como wrapper compatível que continua exigindo simulação. A origem esperada é escolhida pelo modo do cliente; uma resposta de origem diferente é inválida e não preenche campos. O cliente preserva `documentStatus`, sem copiar o objeto bruto, mensagens da rede, métricas ou avaliação arbitrária para a interface/persistência.

Validações: `provider=backend`, indicador de simulação booleano e compatível com o modo, correspondência entre `status`/`documentStatus`/aceitação, campos permitidos e iguais aos da avaliação, ausência de contradições com missing/uncertain, valores positivos em centavos seguros (até R$ 1 milhão, limite documental atual), datas reais, tipos financeiros válidos e categoria acompanhada de tipo. Campos extras financeiros, centavos fracionários e contratos inconsistentes não são aplicados. Texto de erro retornado pela rede não é exibido; mensagens são controladas pelo aplicativo.

| Resultado validado | Comportamento no aplicativo |
| --- | --- |
| `success` | Preenche os campos seguros para revisão; identifica dados reconhecidos, sem aviso demonstrativo. |
| `partial` | Preenche somente campos presentes e seguros; ausentes preservam valores existentes; solicita conferência e complementação. |
| HTTP 200, `status=error`, `documentStatus=rejected` | Mostra rejeição documental, sem chamar a aplicação de campos. Não transforma rejeição em falha de comunicação. |
| HTTP 200, `status=error`, `documentStatus=inconclusive` | Mostra análise inconclusiva, sem alterar campos. Aceita tanto classificação indeterminada quanto classificação aceita sem campos de lançamento. |
| Erro HTTP, rede, timeout ou resposta inválida | Mostra falha operacional, sem campos aplicáveis, retry automático ou fallback para mock. |
| Cancelamento, fechamento ou resposta obsoleta | Descarta aplicação tardia e preserva o formulário. |

Data identificada em success/partial é exibida como informação para conferência. Ela não define data/competência do lançamento. Uma data isolada em `assessment` de análise inconclusiva é validada, mas não produz campos aplicáveis. O suporte não atesta autenticidade fiscal e não altera a política para aceitar documentos sintéticos.

As mensagens distinguem simulação de reconhecimento do documento, inclusive no carregamento e na acessibilidade. O modo real informa antes da seleção que a análise envolve o servidor FinanceIQ e a OpenAI. Avisos de rejeição/inconclusão/falha continuam visíveis junto ao formulário após fechar o seletor.

## Seleção explícita e bloqueios preservados

| `EXPO_PUBLIC_RECEIPT_ANALYSIS_MODE` | Resultado |
| --- | --- |
| ausente / `mock` | Mock local, padrão preservado; nenhuma requisição de análise. |
| `backend-simulated`, em desenvolvimento | Backend autenticado; exige `isSimulated=true`; mensagens demonstrativas. |
| `backend-real`, em desenvolvimento | Backend autenticado; exige `isSimulated=false`; mensagens de análise documental. |
| Modo desconhecido ou qualquer modo backend em build de produção | Bloqueia análise, sem selecionar outro provedor. |

Somente `.env.example` público foi atualizado, mantendo `mock`. Nenhum arquivo privado foi lido/modificado. A opção pública seleciona o consumidor de respostas: **não habilita o backend, não configura chave e não rearma o piloto**. Reiniciar o Expo/recarregar o app é necessário para mudar configuração incorporada à build. Credenciais jamais pertencem a `EXPO_PUBLIC_*`.

O backend e sua trava permanecem inalterados: `disabled`/flag falsa por padrão, Firebase com UID autorizado, validação documental, quotas e marcador persistente de uso único. O primeiro piloto já consumido continua bloqueado. Não apagar/trocar o marcador, apontar para outro diretório, iniciar outra tentativa real ou expor a porta local para testar este frontend. Ver [preparação e registro do piloto](../financeiq-api/docs/receipts-first-real-pilot.md).

## Revisão, categorias e persistência

O formulário já é a área de revisão: descrição, valor, tipo e categoria permanecem editáveis. A importação não chama add/update no Firestore. Somente o handler de **Salvar** existente persiste, com payload financeiro anterior; documento, origem, `documentStatus`, data identificada e metadados da OpenAI não entram no lançamento.

`receiptFormService` e as proteções de categoria manual permanecem inalterados. Categoria precisa existir, estar ativa e ser compatível com o tipo efetivo; escolha manual válida tem prioridade. Mudança de tipo pode limpar escolha incompatível. Não se criam categorias nem se acrescentam consultas a `categoryService.listAll`, cujo efeito de criar padrões já foi identificado. O backend atual usa `categories: []`: uma extração aproveitável tende a permanecer parcial, com categoria a revisar no cliente. Success completo é suportado pelo contrato e testado com resposta falsa/contexto controlado, sem fabricar categorias na rota.

A revisão do formulário invalida resultados quando há edição durante a análise. Cancelamento, perda de foco, desmontagem, fechamento/reabertura e operações posteriores impedem aplicação tardia. O serviço HTTP também reconfere o usuário Firebase após token, multipart, resposta e JSON. Token indisponível, logout ou troca de usuário não libera o resultado; não há armazenamento/log de token nem mudança de autenticação.

## Validação sem API paga

Os testes utilizam exclusivamente clientes falsos, documentos sintéticos e tokens sentinela. Cobrem success/partial reais, rejeição/inconclusão, classificação aceita sem campos, origem divergente, contratos inválidos, HTTPs de erro, timeout/cancelamento/sessão, edição durante espera, categorias e persistência exclusivamente após Salvar. A integração Web executa o multipart/rota/adaptador/validador reais em loopback, com cliente OpenAI falso e SDK de rede bloqueado; não inicia o bootstrap do piloto nem consulta seu marcador operacional.

```powershell
node --test tests/receiptFrontendBackend.test.cjs tests/receiptFrontendHttp.test.cjs tests/receiptIntegration.test.cjs
node --test tests/*.test.cjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node financeiq-api/node_modules/typescript/bin/tsc --noEmit -p financeiq-api/tsconfig.json
git diff --check
```

Para revisão visual sem custos, usar mock/simulação existentes ou fixtures de testes. Nenhuma nova tentativa real está autorizada por esta entrega. Bundle não comprova câmera/permissões, conectividade, autenticação real nem extração fiscal em dispositivo.

Resultados desta entrega: **477 testes aprovados (463 anteriores + 14 novos)**, sem falhas, cancelamentos ou testes ignorados. As três suítes direcionadas de frontend/integração somam 94 aprovados. TypeScript do frontend e backend e `git diff --check` passaram. Exportações Web/Android passaram em produção (`dist/receipts-real-support`) e em desenvolvimento com modo público `backend-real` (`dist/receipts-real-development`), usando Expo offline, `EXPO_NO_DOTENV=1`, telemetria desativada e dois workers. As exportações não executam upload/análise e seus artefatos são ignorados pelo Git. Nenhum teste manual em navegador/aparelho ou chamada paga foi realizado.

## Pendências para produção

- Validação manual Web/Android dos estados reais e eventual teste fiscal válido, com autorização separada e dados tratados conforme a política de privacidade. A rejeição do sintético não comprova precisão de extração.
- Backend apropriado para produção: hoje o modo real é piloto local em desenvolvimento, com uso único consumido. Serviço HTTPS acessível ao dispositivo, controles compartilhados de uso/custo, revisão de retenção/privacidade e autorização operacional precisam de entrega própria. Não ampliar o bind do piloto nem remover bloqueios nesta entrega.
- Política aprovada de ativação em builds de produção; elas continuam bloqueando backend real/simulado. Acesso ao modelo, credencial exclusivamente no backend e nova autorização financeira permanecem externos ao aplicativo.

O suporte do aplicativo está implementado; essas pendências operacionais permanecem desativadas e não foram simuladas como serviço de produção disponível.
