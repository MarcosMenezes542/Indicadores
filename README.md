# VMO — Visitas Operacionais

Aplicativo web (funciona no celular e no computador) para os **Vigilantes Motorizados (VMO)** registrarem as visitas/vistorias às unidades da CPFL, com um **painel do administrador** para acompanhamento e gestão.

## Funcionalidades

**App do VMO** (cada VMO tem o seu próprio usuário e senha)
- Iniciar visita: unidade, **data/hora de chegada** (botão "Registrar chegada agora", editável)
- Situação: tudo normal ou **anormalidade identificada** (até 20 por visita)
  - tipo, gravidade e descrição do ocorrido
  - botões **📷 Tirar foto** (câmera) e **🖼️ Inserir fotos** (galeria), até 10 fotos por anormalidade, com compressão automática
- **Resumo do ocorrido / observações**
- **Data/hora de saída** (botão "Registrar saída agora") e cálculo do tempo de permanência
- A visita em andamento fica salva no aparelho (inclusive as fotos), então nada se perde se o navegador fechar
- Histórico das últimas visitas do próprio VMO

**Painel do administrador**
- Indicadores (KPIs) e **gráficos interativos**: visitas por dia, por VMO, por unidade, anormalidades por categoria e gravidade, tempo médio de permanência e visitas por faixa de horário. Clicar num gráfico filtra todo o painel.
- Filtros por período, VMO, unidade, situação, gravidade e categoria, mais uma busca livre
- Tabela de visitas com detalhes e fotos, impressão individual e exclusão
- **Download dos dados** em CSV e Excel (abas Visitas, Anormalidades e Resumo por VMO)
- **Relatório para impressão/PDF** com indicadores, gráficos, tabela, detalhamento e fotos (opcional)
- **Criação e gestão de usuários** (VMO ou administrador): ativar/desativar e redefinir senha
- Cadastro das unidades CPFL
- Link público de acesso para enviar aos VMOs, com botão para copiar e para enviar pelo WhatsApp

## Arquitetura

- Front-end estático (HTML/CSS/JS puro), sem build, com as bibliotecas em `vendor/`
  (supabase-js 2.45.4, Chart.js 4.4.4, SheetJS 0.18.5)
- Back-end **Supabase** (projeto "Visitas de Vigilancia"):
  - `perfis`: usuários (papel `admin` ou `vigilante`, ativo/inativo)
  - `visitas`: chegada, saída, unidade, anormalidades (JSON com fotos), observações e autor
  - `unidades`: lista de unidades
  - Storage `fotos` (privado): as fotos ficam em `<id do usuário>/<id da visita>/...`
  - Edge Function `gerenciar-usuarios`: cria e edita usuários (só administradores)
  - As regras RLS garantem que cada VMO vê só as próprias visitas e fotos, e o administrador vê tudo
- Login: o VMO digita só o usuário (ex.: `joao.silva`), que vira `joao.silva@vigilancia.local` internamente

## Executar localmente

```bash
python3 -m http.server 8000
# abra http://localhost:8000
```

## Publicação

O site é estático: pode ser publicado na Vercel, no GitHub Pages ou em qualquer hospedagem estática.
A configuração do Supabase fica em `js/config.js` (a chave usada é a publishable, que pode ficar no navegador).
