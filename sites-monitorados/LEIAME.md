# Sites Monitorados — cópia do código publicado

O sistema roda no Supabase (projeto `subfnmtiayaewyoifvpb`) e no Vercel (projeto `sites-monitorados`).
Esta pasta guarda uma cópia das partes alteradas, para histórico.

- `supabase/functions/sites-api/index.ts` — API (Edge Function `sites-api`).
- `assets/painel-auth.js` — script do painel, publicado na tabela `sites_config` (chave `asset:painel-auth.js`).
- `assets/painel-sync.js` — bloco de sincronização, que fica no final de `painel-auth.js`.

## Atualização automática entre usuários

- O painel consulta `GET /rev` a cada 30 s e sempre que o app volta para a tela.
  Se a base mudou, recarrega sozinho com os dados novos e mostra o aviso
  "Painel atualizado com as alterações mais recentes."
  Não recarrega enquanto alguém está editando ou com uma janela aberta.
- Os prints dos mosaicos ficam na tabela `sites_prints` (antes ficavam só no aparelho de quem anexou).
  Rotas: `GET /prints` (lista), `GET /prints?k=` (imagem), `PUT /prints`, `DELETE /prints?k=`.
  Prints que só existiam num aparelho sobem para o servidor quando um usuário com permissão
  de edição abre o painel nesse aparelho.

## Cópias de segurança (tabela `sites_config`)

- `painel_tpl_backup_20261112` — modelo do painel antes da correção do mapa.
- `backup_20261112:painel-auth.js` — script do painel antes da sincronização.
