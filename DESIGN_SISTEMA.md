# Documento de Design e Especificação Técnica
## Projeto: Hub / Copiloto de Segmentos • Espaço Experiência TOTVS

---

### 1. Resumo do Entendimento (Understanding Summary)

- **O que é**: Uma aplicação web interna (**Copiloto do Analista / Hub de Segmentos**) para apoiar os analistas durante os plantões de visita guiada no **Espaço Experiência TOTVS**.
- **Problema que resolve**: Os analistas de segmentos costumam ser especialistas profundos em uma única vertical (ex: Varejo, Manufatura, Agro), mas durante o plantão no laboratório precisam guiar visitantes (clientes, prospects, acadêmicos) com segurança por todos os segmentos expostos.
- **Público-alvo**: Analistas de segmentos TOTVS (plantonistas que consultam os roteiros), especialistas de cada vertical (editores que mantêm os cards atualizados) e liderança/coordenação (administradores).
- **Estrutura Visual da Jornada**: O painel é organizado na **ordem física do tour no laboratório**:
  1. **TOTVS Agro** (plantação, colheita, sacaria, gestão agrícola)
  2. **TOTVS Manufatura** (esteira automatizada, impressora 3D, MES, simulação)
  3. **TOTVS Logística** (baú de caminhão, paletes, WMS/TMS)
  4. **TOTVS Moda** (vitrine de boutique têxtil, franquias, coleções e grade)
  5. **TOTVS Consinco** (gôndolas de supermercado com RFID, self-checkout e atacarejo)
  6. **TOTVS Varejo On-line** (omnichannel, e-commerce, hub de marketplaces e ship from store)
  7. **TOTVS RM Clínicas** (consultório médico, maca, prontuário PEP, faturamento TISS/TUSS)
  8. **Mesa Interativa** (apresentações, vídeos e encerramento com telões)
- **Não-Objetivos**:
  - Não é um portal público para clientes externos.
  - Não substitui os sistemas ERPs ou telas físicas de demonstração.
  - Não é um sistema complexo de agendamento de salas.

---

### 2. Premissas Técnicas e Operacionais (Assumptions)

1. **Responsividade Total**: Funciona com ergonomia tanto em tablets/smartphones (uso na mão durante o percurso físico) quanto em notebooks/desktops.
2. **Ambiente Multiusuário Colaborativo**: A plataforma suporta múltiplos analistas operando, consultando e editando simultaneamente em diferentes dispositivos, com cadastro simples gerenciado pelo ADM e seleção rápida de perfil na entrada.
3. **Mídia Híbrida**: Upload direto para fotos do laboratório e vídeos curtos/rápidos + incorporação de links corporativos (Microsoft Stream, SharePoint, YouTube) para demonstrações longas.
4. **Independência de Nuvem Externa**: A aplicação roda com backend local na rede interna TOTVS, sem depender de bancos de dados externos públicos.

---

### 3. Registro de Decisões (Decision Log)

| # | Decisão | Alternativas Consideradas | Motivo da Escolha |
| :-: | :--- | :--- | :--- |
| **01** | **Jornada Física Sequencial** | Catálogo alfabético / Grid estático | Espelha o percurso real do Espaço Experiência, servindo de guia passo a passo durante a visitação. |
| **02** | **Edição Ágil + Trilha de Auditoria** | Login rígido individual / Sem controle | Permite que qualquer especialista atualize seu segmento sem fricção, mantendo total rastreabilidade. |
| **03** | **Mídia Híbrida (Upload + Links)** | Somente upload / Somente links | Upload para fotos e vídeos rápidos de celular; links corporativos para vídeos institucionais pesados de ERP. |
| **04** | **Arquitetura Fullstack Integrada (PowerShell / React)** | Supabase / Firebase ou Standalone HTML | Máxima aderência à segurança interna TOTVS, com controle completo sobre arquivos e logs. |
| **05** | **Checkpoint de Confirmação Pré-Salvamento** | Salvamento automático direto | Evita alterações acidentais e exige validação explícita do analista antes de publicar. |
| **06** | **Painel de Log de Acessos com Data/Hora (ADM)** | Auditoria restrita a edições | Permite à coordenação saber exatamente quais perfis/analistas acessaram o sistema, quando e que horas. |
| **07** | **Ambiente Multiusuário + Gestão Simples de Usuários** | Plantão único / Login complexo com banco de senhas | Permite acesso e edição simultâneos por múltiplos analistas, com cadastro ágil pelo ADM e tela de boas-vindas personalizada. |

---

### 4. Design da Solução

#### 4.1 Arquitetura & Stack Tecnológica
- **Frontend**: React 18, Vite, Tailwind CSS, Lucide Icons, HTML5 Video Player, React Modal / Dialog.
- **Backend**: Node.js com Express.
- **Persistência**: Arquivos estruturados em `server/data/`:
  - `segmentos.json`: Dados, roteiros, fotos e vídeos de cada vertical.
  - `access_logs.json`: Registro de acessos (Nome/Perfil, data, hora, IP/dispositivo).
  - `audit_logs.json`: Registro de edições (Quem alterou, qual segmento, data/hora e detalhes).
- **Armazenamento de Arquivos**: `server/uploads/` com rotas para imagens e vídeos locais.

#### 4.2 Telas e Funcionalidades

1. **Tela de Identificação do Plantonista (Boas-vindas)**:
   - "Identifique-se para iniciar o tour": Nome e E-mail corporativo.
   - Registra automaticamente o evento no Log de Acessos com timestamp.
2. **Tela Principal: A Jornada do Espaço Experiência**:
   - Barra de progresso da visita física (Estações 1 a 6).
   - Cards visuais com fotos reais dos cenários do laboratório.
   - Atalhos rápidos: "Abrir Roteiro do Segmento" e "Editar Informações".
3. **Modal / Detalhe do Segmento (Modo Copiloto)**:
   - **Aba Discurso (Pitch de 1 min)**: Resumo em linguagem acessível para o visitante, 3 dores do setor e perguntas provocativas.
   - **Aba Bancada Física**: Sistemas TOTVS em demonstração e o que ligar/acionar no laboratório.
   - **Aba Mídias**: Player com vídeo demonstrativo e galeria de fotos.
4. **Modal de Edição Descentralizada com Validação**:
   - Edição de textos, dores e mídias.
   - Botão "Salvar": Dispara pergunta de validação: *"Você confirma a publicação das alterações no segmento [Nome]? Seu nome será registrado no histórico."*
   - Confirmação explícita para commit.
5. **Painel ADM (`/admin`)**:
   - Autenticação por senha mestra.
   - **Aba 1: Log de Acessos**: Tabela com Quem acessou, Perfil, Data e Horário exatos.
   - **Aba 2: Log de Edições**: Tabela com alterações realizadas e analistas responsáveis.
   - **Aba 3: Gestão de Mídias e Backups**: Visão geral do armazenamento.
