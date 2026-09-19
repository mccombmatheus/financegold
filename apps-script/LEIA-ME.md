# Servidor do FinanGold (Google Apps Script)

Este pequeno servidor fica entre o app e as planilhas. Com ele, ninguém precisa
ter a planilha compartilhada no Google Drive: a pessoa só entra com a conta
Google, e o servidor confere a lista **Usuários** da empresa antes de ler ou
gravar qualquer coisa. Quem pode fazer o quê (Visualizador / Editor / Master) é
verificado aqui, no servidor.

## Instalar (uma vez só)

Use a conta Google que é **dona das duas planilhas** (mccomb.matheus@gmail.com).

1. Abra https://script.google.com e clique em **Novo projeto**. Nome: `FinanGold Gateway`.
2. Apague o código que vem no editor e cole o conteúdo de `Code.gs`.
3. Clique na engrenagem **Configurações do projeto**, marque
   **Mostrar arquivo de manifesto "appsscript.json" no editor**, volte ao editor,
   abra `appsscript.json` e substitua tudo pelo conteúdo do arquivo `appsscript.json`
   desta pasta. Salve (Ctrl+S / Cmd+S).
4. Clique em **Implantar → Nova implantação**. No ícone de engrenagem, escolha
   **App da Web**. Preencha:
   - Executar como: **Eu**
   - Quem pode acessar: **Qualquer pessoa**
5. Clique em **Implantar** e autorize quando pedir (aparece "O Google não
   verificou este app": **Avançado → Acessar FinanGold Gateway**). Isso é normal:
   o app é seu.
6. Copie o **URL do app da Web** (termina em `/exec`) e envie para quem mantém o
   FinanGold colocar em `js/config.js` (`GATEWAY_URL`).

## Depois de instalar

- No Google Cloud (Google Auth Platform → Público-alvo), clique em **Publicar
  app**. O login agora pede só o e-mail (escopo não sensível), então não precisa
  de verificação do Google e qualquer conta Google pode entrar — quem decide quem
  vê os dados é a lista Usuários.
- Pode **tirar** o compartilhamento das planilhas com outras pessoas no Drive.
  Só a conta dona precisa ter acesso.

## Atualizar o servidor

Quando o `Code.gs` mudar: cole o novo código, depois **Implantar → Gerenciar
implantações → (lápis) → Versão: Nova versão → Implantar**. O URL continua o mesmo.

## Adicionar uma empresa nova

Inclua o ID da planilha em `SPREADSHEETS` no `Code.gs` (e nova versão, como acima).
O servidor só toca nas planilhas listadas ali.
