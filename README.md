# VMO — Visitas Operacionais

Aplicativo web (funciona no celular e no computador) para os **Vigilantes Motorizados (VMO)** registrarem as visitas/vistorias às unidades da CPFL, com um **painel do administrador** para acompanhamento e gestão.

## Endereços

**Um único link e um único app para todos:** `https://vmo-visitas-operacionais.vercel.app/`

Depois do login, o sistema abre a área de acordo com o perfil:

| Perfil | Vai para | O que pode fazer |
|---|---|---|
| VMO (`vigilante`) | Registro de visitas (`index.html`) | Registrar visitas com fotos e GPS |
| Gestor (`gestor`) | Painel (`admin.html`) | Visualizar, filtrar, baixar e imprimir (somente leitura) |
| Administrador (`admin`) | Painel (`admin.html`) | Tudo, inclusive usuários e unidades |

Quem não tem o perfil certo é redirecionado. Além disso, as regras do banco (RLS) garantem as permissões: o VMO só lê as próprias visitas e o gestor não consegue gravar nada.

## Funcionalidades

**App do VMO** (cada VMO tem o seu próprio usuário e senha)
- Iniciar visita: unidade, **data/hora de chegada** (botão "Registrar chegada agora", editável)
- Situação: tudo normal ou **anormalidade identificada** (até 20 por visita)
  - tipo, gravidade e descrição do ocorrido
  - botões **📷 Tirar foto** (câmera) e **🖼️ Inserir fotos** (galeria), até 10 fotos por anormalidade, com compressão automática
- **Resumo do ocorrido / observações**
- **Data/hora de saída** (botão "Registrar saída agora") e cálculo do tempo de permanência
- A visita em andamento fica salva no aparelho (inclusive as fotos), então nada se perde se o navegador fechar
- Botão **Instalar aplicativo** (Android/Chrome) e instruções para iPhone ("Adicionar à Tela de Início")
- **🔑 Senha**: o próprio VMO pode trocar a senha dele

**Painel do administrador**
- Indicadores (KPIs) e **gráficos interativos**: visitas por dia, por VMO, por unidade, anormalidades por categoria e gravidade, tempo médio de permanência e visitas por faixa de horário. Clicar num gráfico filtra todo o painel.
- Filtros por período, VMO, unidade, situação, gravidade e categoria, mais uma busca livre
- Tabela de visitas com detalhes e fotos, impressão individual e exclusão
- **Download dos dados** em CSV e Excel (abas Visitas, Anormalidades e Resumo por VMO)
- **Relatório para impressão/PDF** com indicadores, gráficos, tabela, detalhamento e fotos (opcional)
- **Gestão de usuários**: criar (VMO ou administrador), editar, ativar/desativar, redefinir senha e excluir, com busca, filtros e último acesso
- **🔑 Minha conta**: alterar a própria senha (pede a senha atual)
- Cadastro das unidades CPFL
- Link público de acesso para enviar aos VMOs, com botão para copiar e para enviar pelo WhatsApp

## Arquitetura

- Front-end estático (HTML/CSS/JS puro), sem build, com as bibliotecas em `vendor/`
  - `index.html`: app do VMO (PWA com `manifest.json` e `sw.js`)
  - `admin.html`: painel do administrador
  (supabase-js 2.45.4, Chart.js 4.4.4, SheetJS 0.18.5)
- Back-end **Supabase** (projeto "Visitas de Vigilancia"):
  - `perfis`: usuários (papel `admin` ou `vigilante`, ativo/inativo)
  - `visitas`: chegada, saída, unidade, anormalidades (JSON com fotos), observações e autor
  - `unidades`: lista de unidades
  - Storage `fotos` (privado): as fotos ficam em `<id do usuário>/<id da visita>/...`
  - Edge Function `gerenciar-usuarios` (código em `supabase/functions/`): criar, listar, atualizar, trocar senha e excluir usuários (só administradores)
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
