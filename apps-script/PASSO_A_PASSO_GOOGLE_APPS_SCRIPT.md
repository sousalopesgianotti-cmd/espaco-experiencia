# Guia Passo a Passo: Implantação no Google Apps Script da TOTVS

Este guia foi elaborado sob medida para o projeto aberto no seu navegador (**script.google.com**).  
Seguindo estes 5 passos simples, o showroom passará a rodar 100% dentro da infraestrutura corporativa da TOTVS, com banco de dados no Google Sheets e compliance total de governança.

---

## 📌 Visão dos Arquivos Gerados no Projeto

Dentro da pasta do projeto, você encontra os arquivos prontos:
1. **`apps-script/Codigo.gs`**: Código do servidor Google Apps Script (gerencia conexões, usuários `@totvs.com.br`, abas da planilha e APIs).
2. **`apps-script/Index.html`**: Código da interface do showroom (Sidebar retrátil, Plantonistas, Registro com 3 pills, Vídeo da Liderança e Contadores).

---

## 🚀 Passo 1: Criar a Planilha Google no seu Drive TOTVS

1. Abra o seu Google Drive corporativo TOTVS.
2. Clique em **+ Novo** > **Planilhas Google** (em branco).
3. No canto superior esquerdo da planilha, dê o nome:  
   **`TOTVS Espaço Experiência - Banco de Dados`**
4. Na barra de endereços do navegador (URL), copie o **ID da Planilha**:
   > `https://docs.google.com/spreadsheets/d/`**`1AbCdEfGhIjKlMnOpQrStUvWxYz`**`/edit`  
   > *(O ID é o código que fica entre `/d/` e `/edit`)*. Guarde esse código!

---

## 💻 Passo 2: Configurar o `Código.gs` no Apps Script

1. Abra a aba do **Google Apps Script** (onde está o seu *"Projeto sem título"* mostrado no print).
2. No topo esquerdo, clique no título *"Projeto sem título"* e renomeie para:  
   **`TOTVS Espaço Experiência`**
3. No menu lateral esquerdo de arquivos, clique em **`Código.gs`**.
4. Apague todo o conteúdo existente e **cole o código completo** do arquivo:  
   👉 **`apps-script/Codigo.gs`**
5. Na **linha 16**, localize:
   ```javascript
   var SPREADSHEET_ID = "COLE_O_ID_DA_SUA_PLANILHA_AQUI";
   ```
   Substitua `"COLE_O_ID_DA_SUA_PLANILHA_AQUI"` pelo ID que você copiou no Passo 1.
6. Pressione **Ctrl + S** (ou clique no ícone de disquete 💾) para salvar.

---

## ⚡ Passo 3: Executar a Carga Inicial Automática (1 Clique!)

Este passo criará todas as abas (*Segmentos*, *Plantonistas*, *Visitantes*, *VideoGestao*, *Logs*) e preencherá automaticamente as 11 estações e os 7 especialistas na planilha:

1. Na barra superior do editor do Apps Script, ao lado do botão "Depurar", localize o menu suspenso de funções.
2. Selecione a função: **`inicializarPlanilha`**.
3. Clique no botão **`▶ Executar`**.
4. O Google abrirá uma janela solicitando autorização:
   - Clique em **Revisar permissões**.
   - Selecione sua conta TOTVS (`@totvs.com.br`).
   - Se aparecer aviso de tela azul, clique em **Avançado** > **Acessar TOTVS Espaço Experiência (não seguro)** > **Permitir**.
5. Aguarde alguns segundos. O *Registro de execução* na parte inferior exibirá:
   > `Planilha configurada e populada com sucesso!`
6. **Validação**: Abra a sua Planilha Google criada no Passo 1 e veja que todas as abas e dados já estão lá organizados e formatados com cabeçalho azul escuro TOTVS!

---

## 🎨 Passo 4: Configurar o `Index.html`

1. Na barra lateral esquerda do Apps Script, localize o arquivo **`Sem título.html`** (que já aparece no seu print).
2. Passe o mouse sobre ele, clique nos **3 pontinhos verticais ⋮** e escolha **Renomear**.
3. Digite **`Index`** e pressione Enter (o Apps Script completará para `Index.html`).
4. Apague o código padrão que estiver dentro dele e **cole o código completo** do arquivo:  
   👉 **`apps-script/Index.html`**
5. Pressione **Ctrl + S** (ou clique no ícone de disquete 💾) para salvar.

---

## 🌐 Passo 5: Implantar (Publicar) como Web App Corporativo

1. No canto superior direito da tela do Apps Script, clique no botão azul **Implantar** > **Nova implantação**.
2. Na janela modal que abrir, clique na engrenagem ⚙️ (ao lado de *Selecione o tipo*) e escolha **App da Web**.
3. Preencha os campos exatamente assim:
   - **Descrição**: `TOTVS Espaço Experiência v1.0`
   - **Executar como**: `Eu (seu e-mail @totvs.com.br)`
   - **Quem tem acesso**: `Qualquer pessoa na TOTVS` (ou no domínio `totvs.com.br`)
4. Clique no botão azul **Implantar**.
5. O Google gerará a **URL do App da Web** (terminada em `/exec`).
6. **Pronto!** Copie essa URL. Ela é o link oficial e permanente do showroom para abrir no navegador, colocar nos totens e compartilhar com toda a TOTVS!

---

## 🛡️ Vantagens de Governança Alcançadas:
- **Zero infraestrutura externa**: Não depende mais do Render nem de servidores de terceiros.
- **Autenticação Automática**: Reconhece automaticamente o e-mail do colaborador logado no Workspace TOTVS.
- **Auditoria Transparente**: Qualquer visita registrada ou alteração de estação cai imediatamente na planilha, podendo ser baixada em Excel para a liderança.
