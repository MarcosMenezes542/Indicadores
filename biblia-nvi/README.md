# Bíblia Sagrada NVI

Aplicativo web (PWA) para leitura da Bíblia Sagrada na **Nova Versão Internacional (NVI)**.
Funciona no navegador do computador ou do celular e pode ser instalado na tela inicial.

## Funcionalidades

- Os 66 livros, com seleção de livro e capítulo (Antigo e Novo Testamento)
- Navegação por botões, setas do teclado (← →) ou deslizando o dedo
- Busca por palavra e acesso direto por referência (ex.: `Jo 3:16`, `Sl 23`, `1 Co 13`)
- Marcação de versículos com cores, favoritos e anotações pessoais
- Copiar e compartilhar versículos
- Temas claro, sépia e escuro; ajuste do tamanho da letra
- Lembra onde você parou; capítulos já lidos ficam salvos para leitura offline
- Links diretos: `index.html#/jo/3/16`

## Como usar

Sirva a pasta com qualquer servidor estático, por exemplo:

```bash
cd biblia-nvi
python3 -m http.server 8080
```

Depois abra `http://localhost:8080`. Para instalar no celular, publique a pasta
(GitHub Pages, Netlify, Vercel…) e use "Adicionar à tela inicial".

## Texto bíblico

O texto da NVI é © Biblica, Inc. e **não** está incluído neste repositório. O app
busca os capítulos na API pública [ABíbliaDigital](https://www.abibliadigital.com.br).
Sem token a API limita o número de consultas por hora; um token gratuito pode ser
criado no site e informado em **Configurações** (fica salvo apenas no aparelho).
