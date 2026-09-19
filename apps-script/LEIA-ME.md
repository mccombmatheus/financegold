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

## Empresas criadas de dentro do app

O administrador do sistema (os e-mails em `ADMIN_EMAILS`, no `Code.gs`) cria empresas novas no **Painel do sistema**, sem mexer em código. O servidor cria uma planilha nova (com todas as abas e listas iniciais) na conta que implantou este script, cadastra o administrador da empresa como Master e registra a empresa em uma planilha chamada "Registro de empresas" (criada sozinha na primeira vez; o ID dela fica nas propriedades do script).

- As empresas que já estão em `SPREADSHEETS` continuam funcionando; as criadas pelo app são somadas a elas.
- Depois de colar um `Code.gs` novo, crie uma **nova versão** da implantação (**Implantar → Gerenciar implantações → lápis → Nova versão**).
- As planilhas das empresas novas pertencem à conta que implantou o script. Cada empresa só enxerga a sua; as regras estão em `apps-script/testes/permissoes.html` (todos devem dar PASS).
- Limite prático: o servidor confere a lista de usuários de cada empresa a cada login. Até umas 20 empresas o login continua rápido; acima disso vale criar um índice de acessos.

## Pedidos de acesso

Quem entra com uma conta Google que ainda não tem acesso vê um formulário para **pedir acesso** (nome, empresa, mensagem). O servidor guarda o pedido na planilha "Registro de empresas" (aba "Solicitações") e **manda um e-mail** para os `ADMIN_EMAILS`. O administrador do sistema responde no **Painel do sistema** (criar a empresa, encaminhar o pedido ao administrador de uma empresa que já existe, ou recusar); quem pediu recebe um e-mail com a resposta.

- Enviar e-mail exige uma permissão nova (`script.send_mail`, já no `appsscript.json`). Ao colar o `Code.gs` **e** o `appsscript.json` novos e criar a nova versão, o Google pede para você **autorizar** de novo: **Autorizar acesso → escolha a conta → Avançado → Acessar → Permitir**.
- Se o e-mail falhar, o pedido continua salvo e aparece na lista do app.
- Limites contra abuso: um pedido em análise por e-mail, um minuto entre tentativas, textos curtos e sem quebras de linha nos campos curtos, no máximo 300 pedidos pendentes. O envio de e-mails tem limite diário do Google (cerca de 100 destinatários por dia em conta gratuita).
- Ajuste `APP_URL` no `Code.gs` se o endereço do app mudar (ele vai nos e-mails).

## Separação: desenvolvedor x pessoas das empresas

- **Quem acessa os dados de uma empresa:** só as pessoas cadastradas no perfil dela (aba Usuários), pelos Masters dela.
- **Quem libera acessos e cria empresas:** só as contas de `ADMIN_EMAILS`, no **Painel do sistema**, uma tela fora de qualquer empresa. O painel mostra pedidos, a lista de empresas (nome, quantidade de pessoas, e-mail dos Masters) e a criação de empresa, e **nunca** dados financeiros. O servidor também impede que essa conta leia os dados de uma empresa da qual ela não é membro.
- Ao criar uma empresa, o administrador do sistema **não entra nela** a menos que marque a caixa de suporte.
- Pedidos de quem diz trabalhar em uma empresa que já existe são **encaminhados por e-mail ao Master dessa empresa**, que cadastra a pessoa no próprio perfil.
- Para usar uma conta de desenvolvedor separada da pessoal: coloque o e-mail dela em `ADMIN_EMAILS`, faça o login com ela (cai direto no Painel do sistema) e, depois de conferir, tire o e-mail pessoal da lista.
