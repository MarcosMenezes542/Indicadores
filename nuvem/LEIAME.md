# Código que roda na nuvem (Supabase)

- `api/index.ts` – função `api` do Supabase (login, chamados, importação de planilha, backups, Excel).
- `site/index.html` – tela do sistema, guardada na tabela `site_arquivos` (caminho `index.html`) e entregue pela função `site`.

A pasta `chamados/` (Vercel) só tem a página de abertura, que busca essa tela e aplica os ajustes (tema etc.).

## Como a função `api` é publicada

A função `api` no Supabase tem dois arquivos:
- `index.ts`: importa `./fornecedor.ts` e depois `nuvem/api/index.ts` deste repositório, fixado num commit (link raw.githubusercontent.com com o hash). Para publicar uma mudança do servidor, faça o commit e troque o hash nessa linha.
- `fornecedor.ts`: cópia de `nuvem/api/fornecedor.ts` (camada do campo Fornecedor). Precisa ser importado antes do servidor principal.
