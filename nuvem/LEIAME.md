# Código que roda na nuvem (Supabase)

- `api/index.ts` – função `api` do Supabase (login, chamados, importação de planilha, backups, Excel).
- `site/index.html` – tela do sistema, guardada na tabela `site_arquivos` (caminho `index.html`) e entregue pela função `site`.

A pasta `chamados/` (Vercel) só tem a página de abertura, que busca essa tela e aplica os ajustes (tema etc.).
