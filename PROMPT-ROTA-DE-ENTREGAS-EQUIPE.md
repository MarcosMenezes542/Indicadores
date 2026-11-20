Quero que você crie um sistema novo chamado **Rota de Entregas Equipe**: um painel web para estabelecimentos + um aplicativo Android para os entregadores, que eu vou vender para vários clientes. Responda sempre em português do Brasil, com linguagem simples (não sou programador).

## Ponto de partida (NÃO altere o app existente)
- Repositório: `MarcosMenezes542/Indicadores`. Na branch `ccr-7054d3a5-uoisba` existe a pasta `app-rotas/`: o app **Rota de Entregas** (Capacitor + HTML/JS, dados só no celular, ativação por código). Ele está funcionando e **não pode ser modificado de forma nenhuma**: nem a pasta `app-rotas/`, nem o workflow `.github/workflows/app-rotas-android.yml`, nem o link de download dele (release `rota-de-entregas`).
- Crie o sistema novo em pastas próprias (por exemplo `app-rotas-equipe/` para o app e `painel-rotas-equipe/` para o painel), copiando do `app-rotas` o que for útil: visual (azul-marinho com laranja), telas da rota, busca de endereço (Photon/Nominatim), mapa (Leaflet + Esri), trajeto e melhor sequência pelas ruas (OSRM), Waze/Google Maps, "Entrega concluída / Não entregue" com motivo, "Recalcular daqui", "Gerar melhor rota a partir daqui", resumo pelo WhatsApp.
- O app novo deve ter **identidade própria no Android** (outro nome, outro ícone, outro `applicationId`, ex.: `br.com.rotadeentregas.equipe`), para poder ficar instalado junto com o app atual.
- Trabalhe numa branch nova a partir de `ccr-7054d3a5-uoisba`.

## Tecnologia
- **Banco de dados e login:** Supabase (eu tenho o conector do Supabase disponível). Crie um projeto novo, separado dos meus outros sistemas.
- **Painel web:** hospedado na Vercel (também tenho o conector), num endereço fixo.
- **Separação entre clientes (multi-empresa):** todos os clientes usam o **mesmo link do painel e o mesmo APK**. Cada empresa só vê e altera os próprios dados. Essa separação deve ser garantida no banco (Row Level Security em todas as tabelas), não só na tela. Teste que um usuário de uma empresa não consegue ler nem alterar dados de outra, nem chamando a API diretamente.
- **Opcional:** link personalizado por cliente (ex.: `.../bomsabor`) que abre o login já com a logo e o nome da empresa.

## Níveis de acesso
| Nível | Quem é | O que pode fazer |
|---|---|---|
| **Administrador** | **Eu** (dono do sistema) | **Tudo, em todos os clientes**: cadastrar empresas, definir plano e limite de entregadores, bloquear/liberar empresas, criar/editar/remover qualquer usuário de qualquer empresa, alterar marca e entregas de qualquer empresa, ver todos os relatórios e um resumo geral (empresas ativas, entregadores ativos, vencimentos). |
| **Gestor** | O cliente que comprou e a equipe de gestão dele | **Tudo dentro da própria empresa**: alterar **logo, nome e cor** da empresa; **criar, editar, bloquear e remover entregadores** conforme a necessidade; cadastrar entregas (uma a uma ou importando planilha Excel/CSV); direcionar cada entrega para um entregador; acompanhar em tempo real; relatórios por dia, entregador e período, com exportação para Excel. **Nunca** vê ou altera dados de outras empresas. |
| **Entregador** | Funcionário do cliente | Só o aplicativo no celular, com as entregas direcionadas a ele. |

- Registre num **histórico** quem criou, alterou, bloqueou ou removeu usuários e entregas, e quando.

## Fluxo de venda
1. Eu vendo e, no meu painel de Administrador, cadastro a empresa (nome, plano, limite de entregadores, data de vencimento) e crio o **primeiro gestor** com o e-mail do cliente.
2. O sistema gera uma **mensagem pronta para WhatsApp** com: link do painel, e-mail, senha provisória e o link de download do app dos entregadores.
3. No primeiro acesso o gestor troca a senha e passa a administrar a empresa dele sozinho.
4. **Limite do plano:** o gestor não consegue criar entregadores acima do limite; o painel avisa para falar comigo.
5. **Bloqueio por falta de pagamento:** quando eu bloqueio uma empresa (ou o plano vence), o painel e o app dos entregadores dela param de funcionar, mostrando uma mensagem para entrar em contato comigo. Os dados **não** são apagados e voltam quando eu libero.

## Marca do cliente
- Tela **"Minha empresa"** no painel: nome da empresa, envio da logo (PNG/JPG até 2 MB, guardada no Supabase Storage) e escolha da cor principal.
- A marca aparece no painel (canto superior), no app do entregador (topo da tela, avisos "novas entregas enviadas por …", botões na cor escolhida) e no resumo da rota enviado pelo WhatsApp.
- O ícone e o nome do app na tela inicial do celular são os mesmos para todos os clientes (isso é esperado).

## Painel (telas)
- **Visão do dia:** números (entregas hoje, entregues, em rota, não entregues), mapa com a posição dos entregadores, andamento de cada entregador, tabela de entregas com escolha do entregador.
- **Entregas:** cadastrar (com busca de endereço e ajuste do ponto no mapa), importar planilha, direcionar, reatribuir, cancelar, filtrar por data/situação/entregador.
- **Entregadores** (e **Gestores**, para quem tem permissão).
- **Relatórios** com exportação para Excel.
- **Minha empresa** (marca).
- Funcionar bem no computador e no celular.

## App do entregador
- Login com usuário e senha criados no painel; ao entrar, carrega a marca da empresa dele.
- As entregas direcionadas chegam sozinhas, em tempo real, com aviso.
- Mesmas funções do app atual: "Gerar melhor rota a partir daqui" (pela posição atual e tempo pelas ruas), mapa com trajeto, Waze/Google Maps, ligar/WhatsApp do cliente, "Entrega concluída / Não entregue" com motivo, "Recalcular daqui", resumo do dia.
- Cada baixa aparece na hora no painel.
- **Sem internet:** continua funcionando com as entregas já recebidas e envia as baixas quando o sinal voltar.
- Envia a localização do entregador para o mapa do painel enquanto o app está aberto.

## Download do aplicativo dos entregadores
- Configure o GitHub Actions para gerar o APK a cada alteração na pasta do app novo e publicá-lo num **link fixo e público**, separado do app atual, no formato:
  `https://github.com/MarcosMenezes542/Indicadores/releases/download/rota-de-entregas-equipe/Rota-de-Entregas-Equipe.apk`
- Use uma **assinatura fixa** desde a primeira versão, para as atualizações instalarem por cima da anterior. Crie a assinatura oficial, entregue o arquivo e a senha só para mim (nunca no repositório) e me explique passo a passo como cadastrá-la nos segredos do GitHub (`EQUIPE_KEYSTORE_BASE64`, `EQUIPE_KEYSTORE_SENHA`, `EQUIPE_KEY_ALIAS`, `EQUIPE_KEY_SENHA`). Enquanto os segredos não existirem, use uma assinatura de teste fixa guardada no projeto.
- Gere também o pacote `.aab` para a Play Store quando a assinatura oficial estiver cadastrada, e prepare a política de privacidade (o app usa localização e guarda nome, telefone e endereço de clientes na nuvem).

## Decisões que você deve me perguntar ANTES de começar
1. O **gestor pode criar outros gestores** na empresa dele, ou só eu?
2. **Cobrança:** valor fixo por empresa ou por entregador? Quais planos?
3. **Localização ao vivo** dos entregadores: só com o app aberto (mais simples) ou também com o app fechado (gasta mais bateria e exige permissão extra)?
4. O **nome final** do app ("Rota de Entregas Equipe" é provisório).

## Forma de trabalho
- Antes de construir, me mostre o plano e uma prévia visual do painel para eu aprovar.
- Teste tudo no navegador (painel e app), incluindo o isolamento entre duas empresas de teste, e me mostre capturas de tela.
- No final, me entregue: o link do painel, o link de download do APK, os dados de acesso do meu usuário Administrador e uma mensagem modelo para enviar aos clientes.
