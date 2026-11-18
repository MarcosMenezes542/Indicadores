# Palco: cifras que rolam sozinhas

Aplicativo Android para músicos. A cifra rola sozinha ou acompanha a voz de quem canta. Tudo fica salvo só no celular, sem servidor e sem internet. A venda é controlada por **código de ativação preso ao aparelho**.

## Recursos

- **Biblioteca** de músicas com busca, salva no próprio celular
- **Rolagem automática** com 20 velocidades
- **Seguir a voz (microfone):** reconhece a letra cantada e leva a cifra até o trecho certo
- **Transposição de tom** com um toque, mantendo os acordes alinhados com a letra
- **Tamanho da letra** ajustável e **modo tela cheia** (toque na cifra)
- **Pedal Bluetooth:** avançar, voltar e dar play (setas, Page Up/Down, espaço)
- **Tela sempre ligada** enquanto a cifra está aberta
- **Backup:** exportar e importar as músicas por arquivo
- **Versão de teste:** limite de músicas até a ativação
- **Códigos com prazo:** teste (tempo livre), mensal, anual ou vitalício

## Estrutura

| Pasta / arquivo | O que é |
|---|---|
| `www/` | O aplicativo (telas, estilos e lógica) |
| `www/js/config.js` | **Configurações**: nome, chave pública, WhatsApp, limite de teste |
| `ferramentas/gerador.html` | **Gerador de códigos de ativação.** Só para você, não envie a clientes |
| `android/` | Projeto Android (gerado pelo Capacitor) |
| `assets/` | Ícone e tela de abertura |

## Como funciona a ativação

1. O cliente instala o app e toca em **Ativar**. O app mostra o **código do aparelho** (ex.: `0P72-XC7H-TE2R`).
2. O cliente paga (Pix, por exemplo) e manda esse código pelo WhatsApp. Há um botão pronto para isso.
3. Você abre o `gerador.html` no computador ou no celular, cola o código e clica em **Gerar**.
4. Você devolve o código de ativação e o cliente cola no app. Pronto.

### Tipos de código e prazos
No gerador, escolha o **tipo** e o **prazo**:

| Tipo | Para que serve | Prazo |
|---|---|---|
| **Teste** | A pessoa experimentar antes de comprar | Você decide: minutos, horas, dias ou até uma data e hora |
| **Mensal** | Mensalidade | 30 dias (pode alterar) |
| **Anual** | Plano anual | 365 dias (pode alterar) |
| **Vitalício** | Compra única | Sem prazo |

- Com código ativo, o app fica **completo**, sem limite de músicas.
- **Perto do vencimento**, o app avisa: teste sempre, planos nos últimos 5 dias. O botão "Comprar" ou "Renovar" abre o seu WhatsApp.
- **Quando vence**, o app volta para a versão limitada. **As músicas não são apagadas**, mas só as primeiras (até o limite de teste) podem ser abertas. Basta colar um novo código para liberar tudo de novo.
- **Mensalidade:** a cada pagamento, use o botão **Renovar** no histórico do gerador e envie o novo código. Se a pessoa não pagar, o acesso termina sozinho.
- **Pix não confirmado:** envie um código de teste curto (por exemplo, 1 dia) e o definitivo quando o pagamento cair.
- **Relógio do celular:** se a pessoa atrasar a data do celular para esticar o prazo, o app percebe e bloqueia até a data ser corrigida.
- O gerador avisa se aquele aparelho **já recebeu um teste** antes.
- Códigos gerados na versão anterior continuam valendo como **vitalícios**.

O código de ativação é uma **assinatura digital**: só a sua chave privada consegue criá-lo, e ele só vale para aquele aparelho. Se alguém copiar o app para outro celular, o código não funciona lá.

## Antes de vender (obrigatório)

O app vem com uma **chave de teste**, que serve só para experimentar. Para vender:

### 1. Crie sua chave
- Abra `ferramentas/gerador.html` no navegador (Chrome) com dois cliques.
- Clique em **Criar minha chave** e depois em **Baixar cópia de segurança**.
- Guarde o arquivo `palco-CHAVE-PRIVADA.json` em lugar seguro. **Se perder, não conseguirá ativar novos clientes. Se vazar, outras pessoas poderão gerar códigos.**

### 2. Coloque a chave pública no app
Em `www/js/config.js`:
```js
chavePublica: 'COLE_AQUI_A_CHAVE_PUBLICA',
chaveDeTeste: false,
whatsappVendedor: '5511999998888', // seu número (opcional)
```

### 3. Crie a assinatura do APK (uma única vez)
O Android identifica o app pela assinatura. **Use sempre a mesma**: sem ela você não consegue lançar atualizações e o código do aparelho dos clientes mudaria.

```bash
keytool -genkey -v -keystore palco-venda.jks -alias palco -keyalg RSA -keysize 2048 -validity 10000
```
Guarde o arquivo `.jks` e a senha junto com a chave privada.

### 4. Gere o APK
**Pelo GitHub (automático):** em *Settings › Secrets and variables › Actions*, crie:

| Segredo | Valor |
|---|---|
| `PALCO_KEYSTORE_BASE64` | conteúdo do `.jks` em base64 (`base64 -w0 palco-venda.jks`) |
| `PALCO_KEYSTORE_SENHA` | senha do keystore |
| `PALCO_KEY_ALIAS` | `palco` |
| `PALCO_KEY_SENHA` | senha da chave |

A cada alteração enviada, o GitHub gera o APK. Ele aparece em *Actions › (última execução) › Artifacts*. Sem esses segredos, sai um APK de **teste** (debug).

**No computador:** com Node.js, Java 21 e Android Studio instalados:
```bash
npm install
npx cap sync android
cd android && ./gradlew assembleRelease
```
Para assinar localmente, crie `android/keystore.properties` (ele não vai para o GitHub):
```
PALCO_KEYSTORE=/caminho/palco-venda.jks
PALCO_KEYSTORE_SENHA=...
PALCO_KEY_ALIAS=palco
PALCO_KEY_SENHA=...
```

## Testar no computador
```bash
npm run servir   # abre em http://localhost:8080
```
No navegador, o "seguir a voz" funciona no Chrome. A ativação também funciona, usando um código de aparelho próprio do navegador.

## Limitações (seja transparente com o cliente)
- **Trocar de celular ou formatar** gera outro código de aparelho. Basta gerar um novo código de ativação para o cliente.
- **Seguir a voz** usa o reconhecimento de voz do Android, que precisa do pacote de português offline (Configurações › Google › Voz) para funcionar sem internet. Instrumento muito alto perto do celular atrapalha. Nesse caso, use a rolagem automática.
- Nenhuma proteção é 100%. Alguém com conhecimento técnico pode modificar o APK, mas o compartilhamento comum (mandar o app pelo WhatsApp) fica bloqueado.
