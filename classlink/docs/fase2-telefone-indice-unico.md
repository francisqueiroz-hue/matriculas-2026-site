# Fase 2 — índice único de telefone (runbook)

**Não faça o merge antes de concluir os passos 1 a 4.** Este PR contém uma migração: o merge na `main`
dispara o deploy de produção, e o `vercel-build` aplica a migração (`scripts/migrate-on-deploy.mjs`,
só com `VERCEL_ENV=production`; prévias não migram).

**Pré-requisito:** o PR da Fase 1 (normalização e checagem no cadastro) já deve estar na `main`.

## O que a migração faz
- Para com erro claro se houver telefone repetido (nada é apagado ou alterado; o build falha e a versão anterior continua no ar).
- Cria `User_phone_key`, índice único em `User.phone`. `NULL` repetido é permitido (quem não tem telefone, ou conta excluída, que zera o campo).
- Testada num Postgres descartável: passa sem duplicatas, recusa telefone repetido novo, aceita vários `NULL` e para com a mensagem se já houver duplicata.

## Passos
1. **Auditar (só leitura).** No Neon, ramo `Produção`, rode `docs/auditoria-telefone.sql`.
   Esperado: `fora_do_padrao = 0` e as consultas 2 e 3 sem linhas. Se aparecer algo, **pare** e resolva primeiro (a consulta mostra só IDs).
2. **Backup.** No Neon, crie um ramo a partir de `Produção` (ex.: `backup-pre-telefone`). Confira também a janela de restauração do seu plano em Settings → Storage.
3. **Testar a migração num ramo descartável.** Crie o ramo `teste-telefone` a partir de `Produção`. No editor SQL **desse ramo**, cole o conteúdo de `prisma/migrations/20261014120000_user_phone_unique/migration.sql` e execute. Depois confirme:
   `SELECT indexname FROM pg_indexes WHERE tablename = 'User' AND indexname = 'User_phone_key';` (deve devolver 1 linha). Apague o ramo de teste.
4. **Prévia na Vercel.** Abra a prévia deste PR e confira que o login e o painel funcionam (a prévia não aplica a migração).
5. **Merge.** Com tudo acima certo, faça o merge. Acompanhe o deploy na Vercel: o log deve mostrar `Migrações em dia.`
6. **Verificar em produção.** Repita a consulta do passo 3 no ramo `Produção` e tente cadastrar um responsável com celular já usado: deve aparecer erro 409 com mensagem em português.

## Reverter
- Se o deploy falhar na migração: nada muda (a versão anterior continua no ar). Leia o log; a mensagem diz quantas duplicatas existem.
- Se for preciso remover depois de aplicada: `DROP INDEX "User_phone_key";` e reverta este PR.

## Limites conhecidos
- O índice vê só texto idêntico. Mesmo celular com e sem o nono dígito continua barrado só pela checagem do app (`telefoneEmUso`); por isso a consulta 3 da auditoria.
- `schema.prisma` ganha `@unique` em `phone`. O mapeamento do erro de unicidade (`P2002`) para a mensagem amigável foi testado com objetos simulados; confirme na prévia/produção que o cadastro duplicado mostra a mensagem em português.
