# Rota de Entregas

Aplicativo Android para entregadores. A pessoa cadastra as entregas (cliente e endereço), o app monta a **melhor sequência** a partir de onde ela está e guia uma parada de cada vez, com Waze ou Google Maps. Tudo fica salvo **só no celular**: não há servidor nem computador ligado. A venda é controlada por **código de ativação preso ao aparelho**, no mesmo modelo do app Palco.

## Recursos

- **Cadastro de entregas:** nome do cliente, endereço com sugestões enquanto digita, telefone e observação
- **Localização exata:** escolha o endereço da lista, toque no mapa para ajustar, use a localização atual ou cole coordenadas (`-22.85, -47.13`)
- **Gerar melhor rota a partir daqui:** o app pega a posição atual do celular e ordena as entregas pelo **tempo de viagem pelas ruas** (sem internet, usa a distância em linha reta)
- **Tela da rota:** mapa com o trajeto e as paradas numeradas, "Parada X de N", barra de progresso, **Waze** e **Google Maps**
- **Entrega concluída / Não entregue**, com o motivo (cliente ausente, endereço não encontrado...)
- **Recalcular daqui:** refaz a ordem das entregas restantes a partir de onde o entregador está
- **Pular entrega:** toque na seta laranja da sequência para fazer aquela entrega agora
- **Ligar ou chamar no WhatsApp** o cliente da parada atual
- **Resumo da rota** para enviar pelo WhatsApp ao final
- **Tela sempre ligada** durante a rota
- **Backup:** exportar e importar as entregas por arquivo
- **Versão de teste:** até 3 entregas por rota, até a ativação
- **Códigos com prazo:** teste (tempo livre), mensal, anual ou vitalício

## O que precisa de internet

| Recurso | Sem internet |
|---|---|
| Cadastrar, concluir e reordenar entregas | Funciona |
| Sugestões de endereço | Não aparecem: marque o ponto tocando no mapa ou cole coordenadas |
| Mapa | Mostra só as partes já vistas antes |
| Linha do trajeto pelas ruas | Vira uma linha tracejada (reta) |
| Melhor rota pelas ruas | Usa a distância em linha reta |
| Waze e Google Maps | Funcionam como sem o app |

Os serviços usados são gratuitos e não pedem cadastro: **OpenStreetMap** (Photon e Nominatim) para endereços, **OSRM** para o trajeto e o tempo entre as entregas e **Esri** para o mapa. São servidores públicos, adequados para uso moderado. Se o número de clientes crescer muito, vale contratar um serviço pago de mapas.

## Estrutura

| Pasta / arquivo | O que é |
|---|---|
| `www/` | O aplicativo (telas, estilos e lógica) |
| `www/js/config.js` | **Configurações**: nome, chave pública, WhatsApp, limite de teste |
| `www/js/rota.js` | Busca de endereços, cálculo da melhor sequência, links do Waze e do Maps |
| `ferramentas/gerador.html` | **Gerador de códigos de ativação.** Só para você, não envie a clientes |
| `android/` | Projeto Android (gerado pelo Capacitor) |
| `assets/` | Ícone e tela de abertura |

## Como funciona a ativação

1. O cliente instala o app e toca em **Ativar**. O app mostra o **código do aparelho** (ex.: `0P72-XC7H-TE2R`).
2. O cliente paga (por Pix, por exemplo) e manda esse código pelo WhatsApp. Há um botão pronto para isso.
3. Você abre o `gerador.html` no computador ou no celular, cola o código e clica em **Gerar**.
4. Você devolve o código de ativação e o cliente cola no app. Pronto.

### Tipos de código e prazos

| Tipo | Para que serve | Prazo |
|---|---|---|
| **Teste** | A pessoa experimentar antes de comprar | Você decide: minutos, horas, dias ou até uma data e hora |
| **Mensal** | Mensalidade | 30 dias (pode alterar) |
| **Anual** | Plano anual | 365 dias (pode alterar) |
| **Vitalício** | Compra única | Sem prazo |

- Com código ativo, o app fica **completo**, sem limite de entregas.
- **Perto do vencimento**, o app avisa: no teste, sempre; nos planos, nos últimos 5 dias. O botão "Comprar" ou "Renovar" abre o seu WhatsApp.
- **Quando vence**, o app volta para a versão limitada. **As entregas não são apagadas**, mas rotas com mais de 3 entregas ficam bloqueadas até a renovação.
- **Relógio do celular:** se a pessoa atrasar a data do celular para esticar o prazo, o app percebe e bloqueia até a data ser corrigida.

O código de ativação é uma **assinatura digital**. Só a sua chave privada consegue criá-lo, e ele só vale para aquele aparelho. Os códigos do **Palco não funcionam neste app**, e os deste app não funcionam no Palco.

## Antes de vender (obrigatório)

O app vem com uma **chave de teste**, própria deste app, que serve só para experimentar.

### 1. Crie sua chave
- Abra `ferramentas/gerador.html` no navegador (Chrome) com dois cliques.
- Clique em **Criar minha chave** e depois em **Baixar cópia de segurança**.
- Guarde o arquivo `rota-CHAVE-PRIVADA.json` em lugar seguro. **Se perder, não conseguirá ativar novos clientes. Se vazar, outras pessoas poderão gerar códigos.**
- O gerador guarda a chave no navegador. Se você usa o mesmo navegador para o gerador do Palco, abra cada um a partir da sua própria pasta: cada app tem a sua chave.

### 2. Coloque a chave pública no app
Em `www/js/config.js`:
```js
chavePublica: 'COLE_AQUI_A_CHAVE_PUBLICA',
chaveDeTeste: false,
whatsappVendedor: '5511999998888', // seu número (opcional)
```

### 3. Assinatura do APK
Pode usar **a mesma assinatura (`.jks`) do Palco**. Se os segredos do Palco já estiverem cadastrados no GitHub, o APK deste app sai assinado com ela, sem fazer nada.

Para uma assinatura própria, crie no GitHub (*Settings › Secrets and variables › Actions*):

| Segredo | Valor |
|---|---|
| `ROTA_KEYSTORE_BASE64` | conteúdo do `.jks` em base64 (`base64 -w0 rota-venda.jks`) |
| `ROTA_KEYSTORE_SENHA` | senha do keystore |
| `ROTA_KEY_ALIAS` | alias da chave |
| `ROTA_KEY_SENHA` | senha da chave |

**Use sempre a mesma assinatura:** sem ela você não consegue lançar atualizações por cima da versão instalada.

### 4. Gere o APK
**Pelo GitHub (automático):** a cada alteração em `app-rotas/`, o GitHub gera o APK. Ele aparece em *Actions › App Rota de Entregas (Android) › (última execução) › Artifacts*. Sem segredos de assinatura, sai um APK de **teste** (debug), assinado com a chave fixa `android/app/assinatura-teste.keystore`. Ela é pública e serve só para as versões de teste instalarem por cima umas das outras. **Não use para vender:** quem for vender deve trocar para a assinatura própria (a mudança exige desinstalar a versão de teste uma vez).

**No computador:** com Node.js, Java 21 e Android Studio instalados:
```bash
npm install
npx cap sync android
cd android && ./gradlew assembleRelease
```

## Testar no computador
```bash
npm run servir   # abre em http://localhost:8080
```
No navegador, o Chrome pede permissão de localização. A ativação também funciona, com um código de aparelho próprio do navegador.

## Limitações (seja transparente com o cliente)
- **Cada celular tem as próprias entregas.** Não há painel central para o dono acompanhar os entregadores em tempo real.
- **Trocar de celular ou formatar** gera outro código de aparelho. Basta gerar um novo código de ativação para o cliente.
- A **melhor rota** usa o tempo de viagem pelas ruas, sem considerar o trânsito do momento. Sem internet, ela usa a distância em linha reta e pode não sair perfeita. Nesses casos, use a seta laranja ou **Recalcular daqui** quando a internet voltar.
- As sugestões de endereço vêm do OpenStreetMap, que tem menos pontos que o Google. Se um endereço não aparecer, toque no mapa para marcar o local.
- Nenhuma proteção é 100%. Alguém com conhecimento técnico pode modificar o APK, mas o compartilhamento comum (mandar o app pelo WhatsApp) fica bloqueado.
