# ERP Robooster — React + Supabase self-hosted

No ar em **erp.robooster.com.br** (stack `robooster_erp` no Swarm desta VPS, Traefik na
frente). Ver também `/root/CLAUDE.md`.

**⚠️ O código-fonte real é ESTA pasta.** O repositório `robooster-erp` no GitHub é um
espelho desatualizado (versão pré-Supabase). Não usar como referência.

## Arquitetura
`src/api/base44Client.js` é um **adaptador**: reimplementa a interface do SDK do Base44
sobre `supabase-js`, com mapa entidade→tabela (`Product`→`products`, etc.).
Auth em `src/lib/AuthContext.jsx` (Supabase Auth).

## ⚠️ Armadilhas que já quebraram o app

**1. Toda tabela nova precisa da coluna `created_date`.**
`entities.X.list()` ordena por `-created_date` por padrão. Sem a coluna, o PostgREST
devolve 42703 e a tela quebra. Foi o bug do cofre (`cofre_membros` tinha `criado_em`).

**2. Nunca `.catch(() => [])` em chamada cujo resultado controla a UI.**
Engole o erro e some com botões, sem deixar rastro.

**3. Autorização vive no banco, não na tela.**
O `AuthContext` faz `role: user_metadata?.role || 'admin'` — todo usuário sem role vira
'admin' no frontend. E `user_metadata` é editável pelo próprio usuário. Logo, master ×
colaborador **tem** que ser garantido por RLS. Existe trigger `contatos_trava_privilegio`
porque num teste um Colaborador se promoveu a Diretor e viu o financeiro.

**4. Telas que escondem itens por permissão devem FALHAR ABERTO.**
Erro na consulta ⇒ mostra tudo (o RLS protege). Fail-closed já trancou o master fora do
próprio ERP.

**5. `notify pgrst, 'reload schema'` nem sempre funciona.**
Depois de criar função ou view, se a API devolver PGRST202 ("not found in schema cache"):
`docker service update --force supabase_supabase_rest`.

## Deploy
```bash
docker build -t robooster-erp:<tag> .
docker service update --image robooster-erp:<tag> robooster_erp_<serviço>
```
Usar **tag versionada** — a `:latest` anterior serve de rollback.

## Cofre de Acessos
Módulo dentro do ERP, 120 credenciais. A tabela real é `credenciais_raw` (cifrada com
pgcrypto, chave no Vault); o que a aplicação enxerga é a **view** `public.credenciais`,
que decifra e filtra master/colaborador, com triggers INSTEAD OF na escrita.
`authenticated` **não** acessa a tabela crua.

**Lição gravada:** num cofre, cifrar **todo campo digitável** — não só os "secretos".
A mesma string era senha num serviço e username noutro, e vazou no dump da v1.

SQL versionado em `scripts/`: `cofre-acessos.sql`, `cofre-criptografia{,-v2}.sql`,
`permissoes.sql`, `permissoes-v2-antiescalada.sql`, `estoque-atomico.sql`.
Backup pré-criptografia em `/root/backups-cofre/`.

## Pendência conhecida
`git push` nunca foi feito — publicar o código no GitHub está na fila.
