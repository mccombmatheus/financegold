# Migração para a conta do sistema (finanponto@gmail.com)

**Objetivo:** o servidor, as planilhas e o login do Google passam a ser da conta `finanponto@gmail.com`. A sua conta pessoal (`mccomb.matheus@gmail.com`) fica só como usuária comum das empresas em que você trabalha.

**Tempo:** cerca de 30 a 40 minutos, quase tudo cliques. **Custo:** R$ 0.

**Segurança da migração:** o app continua apontando para o servidor antigo até a etapa 6. Se algo der errado antes disso, **nada muda** para ninguém. Depois da etapa 6 existe um "desfazer" (etapa 9).

**O que NÃO muda agora:** o GitHub (repositório e endereço do site) continua como está. Mudar o GitHub muda o endereço do site e exige refazer o login do Google; fica para depois, junto com um domínio próprio.

---

## O que você vai precisar

- Dois perfis abertos ao mesmo tempo: a conta pessoal e a `finanponto@gmail.com`. O mais fácil é usar o Chrome com **dois perfis** (ou uma janela normal e uma janela anônima).
- A senha da `finanponto@gmail.com` (só você digita, nunca me mande) e a verificação em duas etapas ativada nela.
- O Terminal aberto na pasta do projeto: `cd "/Users/matheusmccomb/Desktop/financeiro dantas"`.

---

## Etapa 1. Anotar o que vai ser movido (conta pessoal)

1. Abra [script.google.com](https://script.google.com) com a conta **pessoal** e entre no projeto **FinanGold Gateway**.
2. Cole ali o `Code.gs` atual do projeto (o do VS Code) e salve, como sempre. Ele tem uma função nova chamada `diagnostico_migracao`.
3. No topo do editor, escolha a função **`diagnostico_migracao`** e clique em **Executar**. Autorize se pedir.
4. Abaixo, em **Registro de execução**, aparece uma lista: a versão do servidor, o **ID do Registro de empresas** e cada planilha de empresa com um link. **Copie essa lista** para um bloco de notas: você vai usá-la na etapa 3.

## Etapa 2. Google Cloud: dar a propriedade à conta do sistema

Isso mantém o mesmo login do Google e o mesmo `CLIENT_ID`; nada muda no app.

1. Com a conta **pessoal**, abra [console.cloud.google.com/iam-admin/iam](https://console.cloud.google.com/iam-admin/iam) e confira que o projeto do topo é o **APP JOIAS**.
2. Clique em **Conceder acesso** (*Grant access*).
3. Em **Novos principais**, digite `finanponto@gmail.com`. Em **Função**, escolha **Básico → Proprietário** (*Owner*). Salve.
4. Na caixa de entrada da `finanponto@gmail.com` chega um convite do Google Cloud: abra e **aceite**.
5. Confira: entrando em console.cloud.google.com com a conta do sistema, o projeto **APP JOIAS** aparece na lista.

## Etapa 3. Planilhas: transferir a propriedade para a conta do sistema

Faça isto para **cada planilha** da lista da etapa 1: Ipanema, Carolina, o **Registro de empresas** e as empresas criadas pelo app.

1. Com a conta **pessoal**, abra a planilha pelo link. Clique em **Compartilhar**.
2. Adicione `finanponto@gmail.com` como **Editor** e envie.
3. Ainda em Compartilhar, ao lado do nome da conta do sistema, clique na caixinha de permissão e escolha **Transferir propriedade** (*Transfer ownership*). Confirme.
4. Na conta **finanponto**: abra o e-mail "Solicitação de transferência de propriedade" e clique em **Aceitar**. (Ou abra o Google Drive dela, em **Compartilhados comigo**, e aceite.)
5. Depois de aceitar, a conta pessoal continua como **Editora**. Isso é bom: o servidor antigo continua funcionando até você trocar para o novo.

Confira no Drive da `finanponto` (em **Meu Drive**) que todas as planilhas aparecem lá como proprietária.

## Etapa 4. Criar o servidor novo na conta do sistema

1. Com a conta **finanponto**, abra [script.google.com](https://script.google.com) e clique em **Novo projeto**. Nome: `FinanGold Gateway`.
2. Cole o `Code.gs` do VS Code no lugar do código que aparece.
3. Engrenagem → **Mostrar arquivo de manifesto "appsscript.json" no editor** → abra `appsscript.json` e cole o conteúdo de `apps-script/appsscript.json`. Salve.
4. Configure o ID do registro: engrenagem (**Configurações do projeto**) → **Propriedades do script** → **Adicionar propriedade**:
   - Propriedade: `REGISTRY_SPREADSHEET_ID`
   - Valor: o **ID do Registro de empresas** da etapa 1 (a parte comprida entre `/d/` e `/edit` do link).
5. **Implantar → Nova implantação → App da Web**. Executar como: **Eu** (finanponto). Quem pode acessar: **Qualquer pessoa**. Implantar e **autorizar** tudo que o Google pedir (planilhas e envio de e-mail).
6. **Copie o endereço `.../exec`** e guarde.

## Etapa 5. Verificar o servidor novo (sem mexer no app)

No Terminal:

```
python3 apps-script/verificar-servidor.py https://script.google.com/macros/s/SEU_ENDERECO_NOVO/exec
```

Tudo deve sair como **[OK]**, inclusive "a versão publicada é a deste projeto". Se aparecer **[FALHA]**, não continue: me mande o texto.

## Etapa 6. Apontar o app para o servidor novo

No Terminal:

```
python3 apps-script/trocar-gateway.py https://script.google.com/macros/s/SEU_ENDERECO_NOVO/exec
```

O script só troca se as verificações passarem. Depois, no **GitHub Desktop**: escreva `Novo servidor` no Summary, **Commit to main** e **Push origin**. Espere uns 2 minutos.

## Etapa 7. Testes de verdade (com login)

Faça em janelas anônimas separadas:

1. **Conta do sistema (`finanponto`)**: entra direto no **Painel do sistema**. Vê a lista de empresas (Ipanema, Carolina e as outras) com as pessoas e os Masters. Não vê nenhum dado financeiro.
2. **Sua conta pessoal**: vê **só** a Ipanema e a Carolina (sem "Painel do sistema", depois da etapa 8). Abra o painel e os Lançamentos: os dados carregam.
3. **Um lançamento de teste**: crie, confira que aparece, e depois apague a linha na planilha (ou mantenha, se for real).
4. **Empresa de teste**: no Painel do sistema, crie a "Empresa Teste" com um e-mail seu. Confira que a planilha nova aparece no **Drive da finanponto**.
5. **Pedido de acesso**: com uma conta sem acesso, envie um pedido. Confira que o e-mail chega na `finanponto` e que o pedido aparece no painel.
6. **Modo offline** e **celular**: carregue o painel, desligue o wifi e recarregue.

## Etapa 8. Tirar o e-mail pessoal de administrador do sistema

1. No `Code.gs`, deixe: `ADMIN_EMAILS: ["finanponto@gmail.com"],`
2. Cole no projeto **da finanponto** e faça **Implantar → Gerenciar implantações → lápis → Nova versão → Implantar**.
3. Repita o teste 2 da etapa 7: a sua conta pessoal agora vê só as empresas.

## Etapa 9. Se algo der errado (desfazer)

O endereço do servidor **antigo** era:

```
https://script.google.com/macros/s/AKfycbxOBuNTztDP0z4MnEOwb7y9e0MBHsFtQyn9eGjWVdFK-HX3vMXZPo4Jcn58_bR7Gfo9Xg/exec
```

- Se o problema aparecer **depois da etapa 6**: rode `python3 apps-script/trocar-gateway.py <endereço antigo acima>` e faça Commit + Push. O app volta a usar o servidor antigo, que continua funcionando enquanto a conta pessoal for Editora das planilhas.
- Se você já tirou o e-mail pessoal de `ADMIN_EMAILS` no servidor antigo, o painel deixa de aparecer nele, mas as empresas continuam funcionando.

## Etapa 10. Limpeza (uns dias depois, com tudo funcionando)

1. No projeto antigo (conta pessoal): **Implantar → Gerenciar implantações → Arquivar**.
2. No Google Cloud, se quiser, remova a conta pessoal como **Proprietária**.
3. No Drive, remova a conta pessoal como Editora das planilhas.
4. No Google Cloud → **Branding**, troque o **e-mail de suporte** e os **contatos do desenvolvedor** para `finanponto@gmail.com`.

---

## Cuidados com a conta finanponto

- **Verificação em duas etapas** ativada e códigos de backup guardados fora do computador.
- **E-mail de recuperação** que não seja a conta pessoal (de preferência um segundo e-mail ou o telefone de alguém de confiança).
- Não use essa conta para mais nada. Se um dia for vender o projeto, esta é a conta (ou o domínio no Google Workspace) que se transfere.
