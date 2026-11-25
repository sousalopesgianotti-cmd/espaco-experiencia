/**
 * Função utilitária para garantir que nenhuma célula exceda o limite de 50.000 caracteres do Google Sheets
 */
function safeCellValue(val) {
  if (val === null || val === undefined) return "";
  var str = String(val);
  if (str.length > 49000) {
    return str.substring(0, 49000);
  }
  return str;
}

/**
 * Salva alterações de uma estação (pitch, foto, credenciais, equipamentos)
 */
function salvarEstacao(seg) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Segmentos");
    if (!aba) throw new Error("Aba 'Segmentos' não encontrada.");

    var dados = aba.getDataRange().getValues();
    var linha = -1;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === seg.id) {
        linha = i + 1;
        break;
      }
    }

    var padroes = getSegmentosPadrao();
    var segPadrao = null;
    for (var p = 0; p < padroes.length; p++) {
      if (padroes[p].id === seg.id) { segPadrao = padroes[p]; break; }
    }

    var segExistente = null;
    if (linha > 0) {
      var rowExistente = dados[linha - 1];
      var jsonExistente = rowExistente[7];
      if (jsonExistente && typeof jsonExistente === 'string' && jsonExistente.startsWith('{')) {
        try {
          segExistente = JSON.parse(jsonExistente);
        } catch(eExist) {}
      }
      if (!segExistente && segPadrao) {
        segExistente = JSON.parse(JSON.stringify(segPadrao));
      }
      if (rowExistente[5] && (!segExistente || !segExistente.foto_bancada)) {
        if (!segExistente) segExistente = {};
        segExistente.foto_bancada = String(rowExistente[5]);
      }
    } else if (segPadrao) {
      segExistente = JSON.parse(JSON.stringify(segPadrao));
    }

    // --- MERGE DEFENSIVO PRÉ-GRAVAÇÃO ---
    // Impede que salvamentos parciais (ex: apenas texto de clientes/pitch) apaguem mídias já existentes
    if (!seg.foto_bancada && segExistente && segExistente.foto_bancada) {
      seg.foto_bancada = segExistente.foto_bancada;
    } else if (!seg.foto_bancada && segPadrao && segPadrao.foto_bancada) {
      seg.foto_bancada = segPadrao.foto_bancada;
    }

    if (!seg.video_discurso && segExistente && segExistente.video_discurso) {
      seg.video_discurso = segExistente.video_discurso;
    } else if (!seg.video_discurso && segPadrao && segPadrao.video_discurso) {
      seg.video_discurso = segPadrao.video_discurso;
    }

    if ((!seg.midias || !seg.midias.videos || seg.midias.videos.length === 0) && segExistente && segExistente.midias) {
      seg.midias = segExistente.midias;
    } else if ((!seg.midias || !seg.midias.videos || seg.midias.videos.length === 0) && segPadrao && segPadrao.midias) {
      seg.midias = segPadrao.midias;
    }

    if ((!seg.equipamentos || seg.equipamentos.length === 0) && segExistente && segExistente.equipamentos && segExistente.equipamentos.length > 0) {
      seg.equipamentos = segExistente.equipamentos;
    } else if ((!seg.equipamentos || seg.equipamentos.length === 0) && segPadrao && segPadrao.equipamentos) {
      seg.equipamentos = segPadrao.equipamentos;
    }

    if (!seg.cenario_fisico && segExistente && segExistente.cenario_fisico) seg.cenario_fisico = segExistente.cenario_fisico;
    if ((!seg.dores_setor || seg.dores_setor.length === 0) && segExistente && segExistente.dores_setor) seg.dores_setor = segExistente.dores_setor;
    if ((!seg.roteiro_bancada || seg.roteiro_bancada.length === 0) && segExistente && segExistente.roteiro_bancada) seg.roteiro_bancada = segExistente.roteiro_bancada;
    if ((!seg.perguntas_visitante || seg.perguntas_visitante.length === 0) && segExistente && segExistente.perguntas_visitante) seg.perguntas_visitante = segExistente.perguntas_visitante;
    if ((!seg.badge_solucoes || seg.badge_solucoes.length === 0) && segExistente && segExistente.badge_solucoes) seg.badge_solucoes = segExistente.badge_solucoes;
    if (!seg.credenciais && segExistente && segExistente.credenciais) seg.credenciais = segExistente.credenciais;

    var autorNome = (seg.autor && seg.autor.nome) || seg.autor_nome || "Administrador TOTVS";
    var autorEmail = (seg.autor && seg.autor.email) || seg.autor_email || "";
    var autorPerfil = String((seg.autor && seg.autor.perfil) || seg.autor_perfil || "").toLowerCase() === "pmm" ? "pmm" : "adm";

    // 1. Processar foto da bancada em Base64 (salva no Drive e substitui por URL direta)
    if (seg.foto_bancada && String(seg.foto_bancada).startsWith("data:image/")) {
      var uploadBancada = salvarArquivoDrive(seg.foto_bancada, "bancada_" + seg.id);
      if (uploadBancada && uploadBancada.success && uploadBancada.url) {
        seg.foto_bancada = uploadBancada.url;
      } else {
        // NUNCA zerar a foto se o upload falhar! Mantém a existente ou do padrão
        if (segExistente && segExistente.foto_bancada && !String(segExistente.foto_bancada).startsWith("data:image/")) {
          seg.foto_bancada = segExistente.foto_bancada;
        } else if (segPadrao && segPadrao.foto_bancada) {
          seg.foto_bancada = segPadrao.foto_bancada;
        }
      }
    }

    // 2. Processar fotos em Base64 dos equipamentos (salva no Google Drive se possível)
    if (Array.isArray(seg.equipamentos)) {
      for (var k = 0; k < seg.equipamentos.length; k++) {
        var eqItem = seg.equipamentos[k];
        if (eqItem && eqItem.foto && String(eqItem.foto).startsWith("data:image/")) {
          var uploadRes = salvarArquivoDrive(eqItem.foto, eqItem.titulo || "equipamento");
          if (uploadRes && uploadRes.success && uploadRes.url) {
            eqItem.foto = uploadRes.url;
          }
        }
      }
    }

    // 3. Persistir equipamentos na aba dedicada 'Equipamentos' (1 linha por equipamento, com foto isolada)
    salvarEquipamentosEstacao(ss, seg.id, seg.equipamentos || [], autorNome);

    // 4. Criar versão do JSON higienizada sem Base64 extenso para caber com folga na Coluna 8
    var segJson = JSON.parse(JSON.stringify(seg));
    if (segJson.foto_bancada && String(segJson.foto_bancada).startsWith("data:image/")) {
      segJson.foto_bancada = (segExistente && segExistente.foto_bancada && !String(segExistente.foto_bancada).startsWith("data:image/"))
        ? segExistente.foto_bancada
        : ((segPadrao && segPadrao.foto_bancada) || "");
    }

    // Higienizar fotos de midias se forem Base64
    if (segJson.midias && Array.isArray(segJson.midias.fotos)) {
      segJson.midias.fotos = segJson.midias.fotos.map(function(f) {
        if (f && f.url && String(f.url).startsWith("data:image/")) {
          return { titulo: f.titulo || "Foto", url: "" };
        }
        return f;
      });
    }

    // Higienizar fotos de equipamentos no JSON resumido se ainda forem Base64
    if (Array.isArray(segJson.equipamentos)) {
      segJson.equipamentos = segJson.equipamentos.map(function(eq) {
        var copyEq = { id: eq.id, titulo: eq.titulo, descricao: eq.descricao };
        if (eq.foto && !String(eq.foto).startsWith("data:image/")) {
          copyEq.foto = eq.foto;
        } else {
          copyEq.foto = "";
        }
        return copyEq;
      });
    }

    var jsonStr = JSON.stringify(segJson);
    if (jsonStr.length > 48000) {
      var segResumido = {
        id: segJson.id,
        ordem: segJson.ordem,
        nome: segJson.nome,
        tagline: segJson.tagline,
        pitch: segJson.pitch,
        icone: segJson.icone,
        foto_bancada: segJson.foto_bancada,
        video_discurso: segJson.video_discurso,
        credenciais: segJson.credenciais,
        badge_solucoes: segJson.badge_solucoes,
        ultima_atualizacao: segJson.ultima_atualizacao
      };
      jsonStr = JSON.stringify(segResumido);
    }

    // Garantir colunas de cabeçalho na aba Segmentos se necessário (I=Personas, J=PrincipaisClientes)
    try {
      if (aba.getLastColumn() < 10) {
        if (aba.getLastColumn() < 9) {
          aba.getRange(1, 9).setValue("Personas").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
        }
        aba.getRange(1, 10).setValue("PrincipaisClientes").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      }
    } catch(eH) {}

    if (linha > 0) {
      aba.getRange(linha, 2).setValue(safeCellValue(seg.ordem));
      aba.getRange(linha, 3).setValue(safeCellValue(seg.nome));
      aba.getRange(linha, 4).setValue(safeCellValue(seg.tagline || ""));
      aba.getRange(linha, 5).setValue(safeCellValue(seg.pitch || ""));
      aba.getRange(linha, 6).setValue(safeCellValue(seg.foto_bancada || ""));
      aba.getRange(linha, 7).setValue(safeCellValue(seg.icone || "Factory"));
      aba.getRange(linha, 8).setValue(safeCellValue(jsonStr));
      aba.getRange(linha, 9).setValue(safeCellValue(seg.personas || ""));
      aba.getRange(linha, 10).setValue(safeCellValue(seg.principais_clientes || ""));
    } else {
      aba.appendRow([
        safeCellValue(seg.id),
        safeCellValue(seg.ordem),
        safeCellValue(seg.nome),
        safeCellValue(seg.tagline || ""),
        safeCellValue(seg.pitch || ""),
        safeCellValue(seg.foto_bancada || ""),
        safeCellValue(seg.icone || "Factory"),
        safeCellValue(jsonStr),
        safeCellValue(seg.personas || ""),
        safeCellValue(seg.principais_clientes || "")
      ]);
    }

    // Forçar gravação imediata no Google Sheets para evitar leitura de cache desatualizado
    SpreadsheetApp.flush();

    // Registrar log de auditoria na planilha corporativa
    try {
      var abaAud = ss.getSheetByName("LogsAuditoria");
      if (!abaAud) {
        abaAud = ss.insertSheet("LogsAuditoria");
        abaAud.appendRow(["ID", "Data", "Horario", "Analista", "Email", "Perfil", "Estacao", "Acao", "Detalhes"]);
        abaAud.getRange("A1:I1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      }
      var agora = new Date();
      abaAud.appendRow([
        "aud-" + agora.getTime(),
        agora.toLocaleDateString("pt-BR"),
        agora.toLocaleTimeString("pt-BR"),
        autorNome,
        autorEmail || "admin@totvs.com.br",
        autorPerfil,
        seg.nome || seg.id,
        "Edição de Estação",
        "Atualização de conteúdo da estação com merge seguro e blindagem de mídias."
      ]);
    } catch(eAud) {
      Logger.log("Aviso ao registrar auditoria: " + eAud.message);
    }

    return { success: true, segmentos: carregarSegmentos(ss) };
  } catch (err) {
    Logger.log("Erro em salvarEstacao: " + err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Salva alterações do vídeo institucional da liderança
 */
function salvarVideoGestao(dadosVideo) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("VideoGestao");
    if (!aba) {
      aba = ss.insertSheet("VideoGestao");
      aba.appendRow(["Ativo", "Tipo", "Url", "Titulo", "Mensagem", "Subtitulo", "AtualizadoEm", "AtualizadoPor"]);
      aba.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      aba.appendRow([true, "link", "", "Video discurso", "Veja seu discurso aqui !!!", "", "", ""]);
    }

    var usuario = obterUsuarioAtivo();
    var dataAgora = new Date().toLocaleString("pt-BR");

    aba.getRange(2, 1).setValue(dadosVideo.ativo !== false);
    aba.getRange(2, 2).setValue(dadosVideo.tipo || "link");
    aba.getRange(2, 3).setValue(dadosVideo.url || "");
    aba.getRange(2, 4).setValue(dadosVideo.titulo || "Video discurso");
    aba.getRange(2, 5).setValue(dadosVideo.mensagem || "Veja seu discurso aqui !!!");
    aba.getRange(2, 6).setValue(dadosVideo.subtitulo || "");
    aba.getRange(2, 7).setValue(dataAgora);
    aba.getRange(2, 8).setValue(usuario.nome);

    return { success: true, videoGestao: carregarVideoGestao(ss) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * ============================================================================
 * INICIALIZAÇÃO AUTOMÁTICA DA PLANILHA (Executar 1 única vez para criar as abas)
 * ============================================================================
 */
function inicializarPlanilha(ss) {
  if (!ss) ss = getSpreadsheet();
  
  // 1. Aba Segmentos
  var abaSeg = ss.getSheetByName("Segmentos");
  if (!abaSeg) abaSeg = ss.insertSheet("Segmentos");
  abaSeg.clear();
  abaSeg.appendRow(["ID", "Ordem", "Nome", "Tagline", "Pitch", "Foto Bancada", "Icone", "DadosCompletosJSON", "Personas", "PrincipaisClientes"]);
  abaSeg.getRange("A1:J1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
  
  var listaSeg = getSegmentosPadrao();
  try {
    var resSeg = UrlFetchApp.fetch("https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/data/segmentos.json");
    var parsedSeg = JSON.parse(resSeg.getContentText());
    if (parsedSeg && parsedSeg.length > 0) listaSeg = parsedSeg;
  } catch(e) {}

  for (var i = 0; i < listaSeg.length; i++) {
    var s = listaSeg[i];
    abaSeg.appendRow([s.id, s.ordem, s.nome, s.tagline || "", s.pitch || "", s.foto_bancada || "", s.icone || "Factory", JSON.stringify(s), s.personas || "", s.principais_clientes || ""]);
  }

  // 2. Aba Plantonistas
  var abaPlan = ss.getSheetByName("Plantonistas");
  if (!abaPlan) abaPlan = ss.insertSheet("Plantonistas");
  abaPlan.clear();
  abaPlan.appendRow(["RegistroTipo", "ChaveOuData", "NomeOuIdEsp", "CargoOuNomeEsp", "EmailOuTurno", "RamalOuObs", "AvatarCor", "EstacaoFoco"]);
  abaPlan.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");

  var dadosPlan = getPlantonistasPadrao();
  try {
    var resPlan = UrlFetchApp.fetch("https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/data/plantonistas.json");
    var parsedPlan = JSON.parse(resPlan.getContentText());
    if (parsedPlan && parsedPlan.especialistas) dadosPlan = parsedPlan;
  } catch(e) {}

  var esps = dadosPlan.especialistas || [];
  for (var j = 0; j < esps.length; j++) {
    var esp = esps[j];
    abaPlan.appendRow(["ESPECIALISTA", esp.id, esp.nome, esp.cargo, esp.email, esp.ramal, esp.avatar_cor, esp.estacao_foco]);
  }
    var esc = dadosPlan.escalas || {};
    var datas = Object.keys(esc);
    for (var k = 0; k < datas.length; k++) {
      var dStr = datas[k];
      var item = esc[dStr];
      abaPlan.appendRow(["ESCALA", dStr, item.especialista_id, item.nome, item.turno, item.observacoes, "", ""]);
    }

  // 3. Aba Visitantes
  var abaVis = ss.getSheetByName("Visitantes");
  if (!abaVis) abaVis = ss.insertSheet("Visitantes");
  if (abaVis.getLastRow() === 0) {
    abaVis.appendRow(["ID", "Data", "Empresa", "TipoVisitante", "NumeroPessoas", "Responsavel", "CriadoEm", "Timestamp"]);
    abaVis.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
  }

  // 4. Aba VideoGestao
  var abaVid = ss.getSheetByName("VideoGestao");
  if (!abaVid) abaVid = ss.insertSheet("VideoGestao");
  abaVid.clear();
  abaVid.appendRow(["Ativo", "Tipo", "Url", "Titulo", "Mensagem", "Subtitulo", "AtualizadoEm", "AtualizadoPor"]);
  abaVid.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
  abaVid.appendRow([
    true,
    "link",
    "https://drive.google.com/file/d/1VOUtlK5WR5rn6T0LwbAffw3K-GWUDK3M/view?usp=sharing",
    "Video discurso",
    "Veja seu discurso aqui !!!",
    "Mensagem institucional da liderança aos visitantes do Espaço Experiência",
    new Date().toLocaleString("pt-BR"),
    "Administrador"
  ]);

  // 5. Aba Logs
  var abaLogs = ss.getSheetByName("Logs");
  if (!abaLogs) abaLogs = ss.insertSheet("Logs");
  if (abaLogs.getLastRow() === 0) {
    abaLogs.appendRow(["ID", "Data", "Hora", "Usuario", "Acao", "Detalhes"]);
    abaLogs.getRange("A1:F1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
    abaLogs.appendRow(["log-init", new Date().toLocaleDateString("pt-BR"), new Date().toLocaleTimeString("pt-BR"), "Sistema TOTVS", "Inicialização", "Base de dados corporativa inicializada com sucesso"]);
  }

  // 6. Aba Equipamentos (Garante aba dedicada com cabeçalhos padronizados)
  obterOuCriarAbaEquipamentos(ss);

  // Remover 'Página1' se existir
  try {
    var sheetPadrao = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
    if (sheetPadrao && ss.getSheets().length > 1) {
      ss.deleteSheet(sheetPadrao);
    }
  } catch (e) {}

  Logger.log("Planilha configurada e populada com sucesso!");
  return "SUCESSO: Todas as abas foram criadas e populadas com sucesso!";
}


/**
 * ============================================================================
 * DADOS PADRÃO EMBUTIDOS (SELF-HEALING SEM DEPENDÊNCIA EXTERNA)
 * ============================================================================
 */
function getSegmentosPadrao() {
  return [
  {
    "id": "totvs_agro",
    "ordem": 1,
    "nome": "TOTVS Agro",
    "icone": "Sprout",
    "cor": "emerald",
    "tagline": "Tecnologia de ponta do plantio à mesa do consumidor",
    "badge_solucoes": [
      "Multicultivo",
      "Agrodistribuidor"
    ],
    "cenario_fisico": "Cenário com painel de colheita e lavoura de trigo com pragas e um drone acima.\nUm PC na tela com as soluções na bancada\nUm tablet na bancada",
    "pitch": "O agronegócio move o PIB brasileiro e a TOTVS oferece sistemas completos que conectam desde a gestão da lavoura e insumos até o beneficiamento, comercialização e exportação de grãos, café, cana e algodão.",
    "dores_setor": [
      "Falta de controle de custos de insumos e maquinário por talhão/área de plantio.",
      "Perda de eficiência no transporte, pesagem e classificação de grãos nos armazéns.",
      "Dificuldade em gerenciar contratos futuros e oscilações do mercado de commodities."
    ],
    "roteiro_bancada": [
      "Aponte para o cenário de sacarias e grãos: explique que o Brasil é líder mundial e a TOTVS atende os maiores produtores do país.",
      "Mostre na tela do Agro o mapa de produtividade e a gestão integrada de contratos e estoques.",
      "Destaque que a TOTVS atua tanto no pequeno produtor de café quanto nas gigantes de cana-de-açúcar, soja e algodão."
    ],
    "perguntas_visitante": [
      "Vocês possuem operações ligadas ao agronegócio ou fornecem insumos para produtores rurais?",
      "Como vocês controlam hoje a rastreabilidade e o custo por hectare/safra?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Cenário Agro & Sacaria de Café",
          "url": "https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Vídeo Demonstrativo de TOTVS Agro",
          "url": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_160250_totvs_agro.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 16:03:00",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC Agro",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_105823_esta__o_1_totvs_agro.jpeg",
    "equipamentos": [
      {
        "id": "eq-totvs_agro-1",
        "titulo": "PC Agro",
        "descricao": "Usuário: ens.experiencia@totvs.com.br • Senha: Experienciastotvs@2026",
        "foto": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_105823_esta__o_1_totvs_agro.jpeg"
      }
    ],
    "video_discurso": {
      "tipo": "google_drive",
      "url": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_160250_totvs_agro.mp4",
      "titulo": "Vídeo Demonstrativo de TOTVS Agro"
    },
    "autor": {
      "nome": "Juliana PMM Auditoria",
      "email": "auditoria.pmm.1792064095524@totvs.com.br",
      "perfil": "pmm"
    },
    "detalhes": "Edição de discurso realizada por PMM para validação de auditoria.",
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_manufatura",
    "ordem": 2,
    "nome": "TOTVS Manufatura",
    "icone": "Factory",
    "cor": "blue",
    "tagline": "Indústria 4.0, chão de fábrica em tempo real e automação",
    "badge_solucoes": [
      "TOTVS Manufatura",
      "TOTVS MES",
      "APS Avançado",
      "Manutenção de Ativos"
    ],
    "cenario_fisico": "Bancada industrial com esteira transportadora motorizada, impressora 3D para prototipagem rápida, coletores de dados e telas de monitoramento OEE.",
    "pitch": "Aqui na bancada de Manufatura, demonstramos a Indústria 4.0 na prática. Quando uma peça passa pela esteira, sensores capturam a produção em tempo real no TOTVS MES, calculando disponibilidade, performance e qualidade (OEE). Integramos desde o planejamento fino da produção (APS) até a impressora 3D e a manutenção preventiva das máquinas.",
    "dores_setor": [
      "Paradas não programadas de maquinário e alto custo de manutenção corretiva.",
      "Apontamento manual de produção em papel, gerando atraso e erros nos dados de chão de fábrica.",
      "Falta de visibilidade precisa do índice OEE (Overall Equipment Effectiveness) em tempo real."
    ],
    "roteiro_bancada": [
      "Acione a esteira transportadora motorizada para demonstrar o fluxo de peças físicas no laboratório.",
      "Mostre a impressora 3D em funcionamento, explicando o conceito de prototipagem rápida e peças sob demanda na manufatura.",
      "Aponte para o monitor 'Visão TOTVS MES' e mostre o gráfico de OEE atualizando conforme as peças transitam na esteira."
    ],
    "perguntas_visitante": [
      "Como é feito hoje o apontamento de produção na fábrica de vocês? Ainda usam fichas de papel ou planilhas?",
      "Vocês conseguem saber em tempo real se uma linha de montagem está com velocidade reduzida ou parada?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Bancada Industrial com Esteira e Sensores",
          "url": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Simulação de Chão de Fábrica - TOTVS MES",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 10:58:35",
      "autor": "Analista TOTVS"
    },
    "credenciais": {
      "equipamento": "PC Manufatura",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_105834_esta__o_2_totvs_manufatura.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_manufatura_1",
        "titulo": "PC Manufatura",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Simulação de Chão de Fábrica - TOTVS MES"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "backoffice",
    "ordem": 3,
    "nome": "Backoffice",
    "icone": "Building",
    "cor": "sky",
    "tagline": "Gestão empresarial integrada, controladoria, financeiro e compras",
    "badge_solucoes": [
      "TOTVS Protheus",
      "Linha Datasul",
      "Linha RM",
      "TOTVS Gestão Financeira",
      "Controladoria & Fiscal"
    ],
    "cenario_fisico": "Bancada com estação corporativa, telas com dashboards gerenciais e cockpit financeiro/fiscal.",
    "pitch": "O Backoffice da TOTVS é o coração pulsante das organizações brasileiras. Nossos ERPs líderes de mercado unificam toda a operação administrativa: financeiro, fiscal, compras, faturamento e contabilidade com automação inteligente e conformidade tributária total.",
    "dores_setor": [
      "Complexidade tributária e risco constante de autuações fiscais.",
      "Falta de integração ágil entre compras, estoque e contas a pagar.",
      "Demora no fechamento contábil e na consolidação de resultados gerenciais."
    ],
    "roteiro_bancada": [
      "Mostre na tela a visão consolidada de fluxo de caixa e DRE em tempo real.",
      "Destaque a segurança e atualização automática das regras tributárias brasileiras.",
      "Explique como o ERP conecta os sistemas especialistas de todos os segmentos ao núcleo da empresa."
    ],
    "perguntas_visitante": [
      "Como é feita hoje a gestão do fechamento contábil e conciliação bancária da sua empresa?",
      "Vocês enfrentam gargalos no cumprimento das obrigações fiscais e tributárias?"
    ],
    "midias": {
      "fotos": [],
      "videos": [
        {
          "titulo": "Vídeo do Tour no Espaço Experiência",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 11:30:08",
      "autor": "Analista TOTVS"
    },
    "credenciais": {
      "equipamento": "PC Backoffice",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_113005_esta__o_3_backoffice.jpeg",
    "equipamentos": [
      {
        "id": "eq_backoffice_1",
        "titulo": "PC Backoffice",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_113005_esta__o_3_backoffice.jpeg"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Vídeo do Tour no Espaço Experiência"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_mes_ppi",
    "ordem": 4,
    "nome": "TOTVS MES / PPI Multitask",
    "icone": "Cpu",
    "cor": "cyan",
    "tagline": "Chão de fábrica digital, apontamento de produção em tempo real e OEE",
    "badge_solucoes": [
      "TOTVS MES",
      "PPI Multitask",
      "Apontamento IoT",
      "OEE em Tempo Real",
      "Manutenção Industrial"
    ],
    "cenario_fisico": "Bancada industrial com sensores IoT, coletores de chão de fábrica e monitores com KPIs de linha de produção.",
    "pitch": "Com o TOTVS MES e a solução PPI Multitask, digitalizamos o chão de fábrica sem papel. Monitoramos cada máquina, operador e ordem de produção em tempo real, calculando a eficiência global (OEE) e eliminando paradas não planejadas.",
    "dores_setor": [
      "Apontamento de produção manual em papel com atraso e retrabalho de digitação.",
      "Desconhecimento dos reais gargalos e causas de paradas de máquinas na linha.",
      "Perda de produtividade por falta de visibilidade do índice OEE em tempo real."
    ],
    "roteiro_bancada": [
      "Aponte para os sensores industriais e simule o ciclo de produção de uma peça.",
      "Mostre na tela o cockpit do TOTVS MES atualizando a velocidade e qualidade da linha.",
      "Destaque a integração direta com o ERP para baixa automática de matérias-primas."
    ],
    "perguntas_visitante": [
      "Como vocês acompanham o ritmo e as paradas de produção na fábrica hoje?",
      "Vocês têm os índices de OEE e refugo disponíveis em tempo real para os gestores?"
    ],
    "midias": {
      "fotos": [],
      "videos": [
        {
          "titulo": "Simulação de Chão de Fábrica - TOTVS MES",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 11:30:17",
      "autor": "Analista TOTVS"
    },
    "credenciais": {
      "equipamento": "PC MES Multitask",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_113016_esta__o_4_totvs_ppi_multitask_mes.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_mes_ppi_1",
        "titulo": "PC MES Multitask",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_113016_esta__o_4_totvs_ppi_multitask_mes.jpeg"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Simulação de Chão de Fábrica - TOTVS MES"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_logistica",
    "ordem": 5,
    "nome": "TOTVS Logística",
    "icone": "Truck",
    "cor": "amber",
    "tagline": "Armazenagem inteligente, roteirização e visibilidade da frota",
    "badge_solucoes": [
      "TOTVS WMS",
      "TOTVS TMS",
      "Torre de Controle Logística",
      "Cockpit Logístico"
    ],
    "cenario_fisico": "Traseira real de caminhão embutida na parede, doca de carga e descarga com paletes e caixas organizadas.",
    "pitch": "A logística é a espinha dorsal que conecta a fábrica ao ponto de venda. Com o TOTVS WMS e TMS, gerenciamos desde a armazenagem e separação por voice picking até a expedição no baú do caminhão, roteirização inteligente e rastreamento em tempo real com comprovante digital de entrega.",
    "dores_setor": [
      "Erros no picking e separação de mercadorias no centro de distribuição, gerando devoluções.",
      "Custo elevado de frete e ociosidade da frota por falta de otimização de rotas e cubagem.",
      "Falta de rastreabilidade do status de entrega para o cliente final (last mile)."
    ],
    "roteiro_bancada": [
      "Leve o visitante em direção ao baú do caminhão cenográfico: destaque o realismo da operação de doca.",
      "Explique como o WMS direciona a melhor localização de armazenagem no palete com base em giro e validade (FIFO/FEFO).",
      "Mostre na tela a Torre de Controle Logística rastreando os veículos no mapa com alertas de desvio de rota e temperatura."
    ],
    "perguntas_visitante": [
      "Sua operação logística possui frota própria ou terceirizada?",
      "Qual é o maior gargalo hoje: a acuracidade de estoque no CD ou o cumprimento dos prazos de entrega no destino?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Cenário de Doca e Baú de Transporte",
          "url": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Operação Logística no Espaço Experiência",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "16/09/2026 15:15",
      "autor": "Especialista TOTVS Logística"
    },
    "credenciais": {
      "equipamento": "PC Logistica",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/bancada_totvs_logistica.jpg",
    "equipamentos": [
      {
        "id": "eq_totvs_logistica_1",
        "titulo": "PC Logistica",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Operação Logística no Espaço Experiência"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_moda",
    "ordem": 6,
    "nome": "Loja Totvs Moda",
    "icone": "ShoppingBag",
    "cor": "rose",
    "tagline": "A solução completa para toda a cadeia da moda e confecção",
    "badge_solucoes": [
      "TOTVS Moda ERP",
      "Gestão de Franquias",
      "Controle de Grade (Cor/Tam)",
      "PDV Móvel Moda",
      "Omnichannel Têxtil"
    ],
    "cenario_fisico": "Vitrine de boutique de moda completa com manequins, bolsas, coleções e telas com a campanha 'A Força que Move o Brasil'.",
    "pitch": "O TOTVS Moda é a solução líder que veste as maiores marcas do Brasil. Desenvolvida especificamente para as particularidades do segmento têxtil e calçadista, a solução gerencia todo o ciclo de vida da peça: desenvolvimento de coleções, ficha técnica com controle minucioso de grade de cores e tamanhos, faturamento no atacado, controle de facções e frentes de caixa ágeis para lojas próprias e franquias.",
    "dores_setor": [
      "Dificuldade de controle de estoque com variações complexas de grade (tamanhos P/M/G e cartela de cores).",
      "Perda de prazos no lançamento de coleções e falta de rastreabilidade de facções externas.",
      "Desconexão entre o estoque das lojas físicas, franquias e o e-commerce de moda."
    ],
    "roteiro_bancada": [
      "Posicione-se diante da vitrine de boutique de moda no laboratório.",
      "Mostre na tela do TOTVS Moda a facilidade de consulta de peças por grade de cor e tamanho e a velocidade de fechamento de venda no PDV.",
      "Destaque que a TOTVS atende desde confecções de vestuário e calçados até grandes redes de franquias de moda em shoppings."
    ],
    "perguntas_visitante": [
      "A operação de vocês trabalha com gestão de grade de produtos (cor/tamanho) ou coleções sazonais?",
      "Como vocês integram hoje a venda das lojas físicas com as vendas do e-commerce?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Vitrine Boutique TOTVS Moda",
          "url": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Espaço TOTVS Moda no Laboratório",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        },
        {
          "titulo": "Vídeo Demonstrativo de Loja Totvs Moda",
          "url": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_160649_totvs_moda.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 16:06:55",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC Moda",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_120933_totvs_moda.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_moda_1",
        "titulo": "PC Moda",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Espaço TOTVS Moda no Laboratório"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_consinco",
    "ordem": 7,
    "nome": "Loja TOTVS Consinco",
    "icone": "ShoppingCart",
    "cor": "red",
    "tagline": "Líder absoluto para supermercados, atacarejo e grandes redes",
    "badge_solucoes": [
      "Consinco ERP",
      "Portais de Leitura RFID",
      "Self-Checkout Touch",
      "WMS Supermercados",
      "Prevenção de Perdas"
    ],
    "cenario_fisico": "Gôndolas de supermercado com produtos de limpeza e alimentos reais, esteira de checkout, portais RFID e totens interativos de autoatendimento.",
    "pitch": "O TOTVS Consinco é o padrão de mercado para as maiores redes de supermercados, atacarejos e hipermercados do Brasil. Aqui no laboratório demonstramos o futuro do varejo supermercadista: portais de leitura RFID onde o cliente passa com a cesta de produtos e a leitura é feita instantaneamente sem bipar código por código, além de totens de self-checkout intuitivos e gestão integrada de prevenção de perdas.",
    "dores_setor": [
      "Filas longas no checkout em horários de pico, gerando insatisfação e abandono de carrinhos.",
      "Altas taxas de ruptura de gôndola e perdas por produtos com validade vencida.",
      "Margem de lucro apertada exigindo controle rigoroso de preços, compras conjuntas e acordos de fornecedores."
    ],
    "roteiro_bancada": [
      "Convide o visitante a testar o totem de Self-Checkout: mostre a simplicidade da interface com tela touch.",
      "Apresente os portais RFID e explique a economia drástica de tempo de inventário e de fila no supermercado.",
      "Aponte para a gôndola real e comente sobre o controle automatizado de reposição e precificação eletrônica do Consinco."
    ],
    "perguntas_visitante": [
      "Vocês já utilizam ou avaliam tecnologias de autoatendimento (self-checkout) para reduzir filas?",
      "Qual o impacto das perdas de estoque e quebras operacionais na margem do negócio hoje?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Gôndola Inteligente e Self-Checkout",
          "url": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Demonstração de Supermercado e RFID",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 16:07:24",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC Supermercado Consinco",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_120944_totvs_consinco.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_consinco_1",
        "titulo": "PC Supermercado Consinco",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Demonstração de Supermercado e RFID"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_varejo_online",
    "ordem": 8,
    "nome": "TOTVS Varejo On-line",
    "icone": "Globe",
    "cor": "purple",
    "tagline": "Omnichannel integrado, e-commerce, marketplaces e prateleira infinita",
    "badge_solucoes": [
      "TOTVS Omnichannel",
      "Hub de Marketplaces",
      "Ship from Store",
      "Click & Collect",
      "Catálogo Digital"
    ],
    "cenario_fisico": "Displays digitais integrados com soluções de varejo, postos de combustíveis, lojas de conveniência e integração e-commerce.",
    "pitch": "No TOTVS Varejo On-line, quebramos a barreira entre a loja física e o mundo virtual. Nossas soluções conectam o varejista aos principais marketplaces do mercado e transformam as lojas físicas em mini-centros de distribuição com o 'Ship from Store'. O cliente compra online e retira na loja mais próxima, enquanto a empresa opera com estoque unificado e sem ruptura.",
    "dores_setor": [
      "Divergência entre o estoque anunciado no e-commerce e a disponibilidade real na loja física.",
      "Dificuldade e lentidão para cadastrar e sincronizar produtos em múltiplos marketplaces.",
      "Custos de frete elevados e prazos de entrega longos por falta de envio a partir da loja física mais próxima."
    ],
    "roteiro_bancada": [
      "Demonstre na tela como um pedido realizado em marketplace cai instantaneamente no sistema central.",
      "Explique o conceito de 'Prateleira Infinita': o vendedor na loja física vende um produto que está no estoque central ou em outra filial.",
      "Mostre a experiência do cliente que compra no site e retira na loja física em poucas horas."
    ],
    "perguntas_visitante": [
      "A operação de vocês já vende em marketplaces (Mercado Livre, Amazon, Shopee) com estoque integrado?",
      "Vocês já utilizam as lojas físicas como pontos de envio rápido de pedidos para baratear o frete?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Integração Digital e E-commerce",
          "url": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Vídeo Demonstrativo de TOTVS Varejo On-line",
          "url": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_160329_varejo_on_line.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 16:03:36",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC Varejo On-line",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_120958_totvs_varejo.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_varejo_online_1",
        "titulo": "PC Varejo On-line",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "url",
      "url": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_160329_varejo_on_line.mp4",
      "titulo": "Vídeo Demonstrativo de TOTVS Varejo On-line"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "totvs_rm_clinicas",
    "ordem": 9,
    "nome": "TOTVS RM Clínicas",
    "icone": "Stethoscope",
    "cor": "teal",
    "tagline": "Gestão completa para clínicas, consultórios médicos e policlínicas",
    "badge_solucoes": [
      "Linha RM Clínicas",
      "Prontuário Eletrônico (PEP)",
      "Faturamento TISS/TUSS",
      "Agendamento Inteligente",
      "Repasse Médico"
    ],
    "cenario_fisico": "Consultório médico completo com maca hospitalar, mesa de atendimento clínico, estante de medicamentos e telas com indicadores clínicos.",
    "pitch": "O TOTVS RM Clínicas é a solução consagrada da Linha RM especializada no atendimento de consultórios, clínicas de especialidades, centros diagnósticos e policlínicas. A solução unifica toda a jornada do paciente: agendamento online, prontuário eletrônico completo (PEP), prescrição digital com checagem de interações medicamentosas, além de blindar o faturamento com regras rigorosas de TISS/TUSS e repasse médico transparente.",
    "dores_setor": [
      "Alto índice de glosas médicas por preenchimento incorreto de guias dos convênios de saúde.",
      "Faltas de pacientes (no-show) por falta de confirmação automatizada de consultas.",
      "Complexidade e demora no cálculo de repasse financeiro para o corpo clínico de médicos especialistas."
    ],
    "roteiro_bancada": [
      "Aponte para o cenário de consultório com a maca clínica e a mesa de atendimento médico.",
      "Mostre na tela o Prontuário Eletrônico (PEP) da Linha RM, demonstrando a facilidade de evolução clínica e prescrição digital.",
      "Explique a inteligência do motor de faturamento TISS que valida códigos e autorizações antes de enviar para as operadoras de saúde."
    ],
    "perguntas_visitante": [
      "A instituição de vocês realiza atendimentos ambulatoriais, consultas ou exames com múltiplos convênios?",
      "Qual o percentual de glosas e como é feito hoje o controle do repasse para os médicos?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Consultório Médico no Espaço Experiência",
          "url": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Estação Clínica no Espaço Experiência",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 16:07:50",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC RM Saude",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_121009_totvs_rm_saude.jpeg",
    "equipamentos": [
      {
        "id": "eq_totvs_rm_clinicas_1",
        "titulo": "PC RM Saude",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": "https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Estação Clínica no Espaço Experiência"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "mesa_interativa",
    "ordem": 10,
    "nome": "Mesa Interativa",
    "icone": "MonitorPlay",
    "cor": "indigo",
    "tagline": "Grandes telões, mesa touch com LED e cases de sucesso do ecossistema",
    "badge_solucoes": [
      "TOTVS Fluig",
      "Carol AI (Inteligência Artificial)",
      "TOTVS Techfin",
      "Cases de Sucesso"
    ],
    "cenario_fisico": "Mesa digital touch monumental com iluminação LED azul, banquetas para visitantes e telões suspensos em parceria com Cisco e Samsung.",
    "pitch": "Finalizamos a visita na Mesa Interativa. Aqui consolidamos a visão de ecossistema: além dos sistemas especialistas de cada segmento, a TOTVS oferece Inteligência Artificial com a Carol, soluções de crédito e serviços financeiros com a Techfin e integração com o Fluig. É o momento perfeito para exibir vídeos institucionais de cases de sucesso e responder às dúvidas finais dos clientes.",
    "dores_setor": [
      "Sistemas legados desconectados que não conversam entre si.",
      "Dificuldade de acesso a crédito ágil para capital de giro e antecipação de recebíveis.",
      "Falta de inteligência de dados centralizada para suporte à tomada de decisão executiva."
    ],
    "roteiro_bancada": [
      "Convide os visitantes a se acomodarem nas banquetas ao redor da mesa iluminada em azul.",
      "Utilize a superfície interativa para demonstrar gráficos de ecossistema e acionar vídeos de cases no telão principal.",
      "Abra espaço para perguntas, agradeça a visita institucional e colete os contatos para o envio de propostas ou aprofundamentos."
    ],
    "perguntas_visitante": [
      "Quais das estações que visitamos hoje mais chamou a atenção para o momento atual da sua empresa?",
      "Gostariam de agendar uma reunião técnica focada com o especialista daquele segmento?"
    ],
    "midias": {
      "fotos": [
        {
          "titulo": "Mesa Interativa Central com Iluminação LED",
          "url": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80"
        }
      ],
      "videos": [
        {
          "titulo": "Apresentação e Telões da Mesa Central",
          "tipo": "local",
          "url": "/Video Espaço Experiência.mp4"
        }
      ]
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 12:12:16",
      "autor": "Analista TOTVS"
    },
    "credenciais": {
      "equipamento": "PC Mesa Interativa",
      "usuario": ".",
      "senha": "totvsdiretoria ou rsxw7"
    },
    "foto_bancada": "https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/uploads/media_20261005_121049_mesa_interativa.jpeg",
    "equipamentos": [
      {
        "id": "eq_mesa_interativa_1",
        "titulo": "PC Mesa Interativa",
        "descricao": "Usuário: .\nSenha: totvsdiretoria ou rsxw7",
        "foto": "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=800&q=80"
      }
    ],
    "video_discurso": {
      "tipo": "local",
      "url": "/Video Espaço Experiência.mp4",
      "titulo": "Apresentação e Telões da Mesa Central"
    },
    "personas": "",
    "principais_clientes": ""
  },
  {
    "id": "solucoes_cross",
    "ordem": 11,
    "nome": "SOLUÇÕES CROSS",
    "icone": "Cpu",
    "cor": "purple",
    "tagline": "Soluções horizontais, inteligência artificial e ecossistema conectado",
    "badge_solucoes": [
      "TOTVS Fluig",
      "Carol AI",
      "TOTVS Assinatura Eletrônica",
      "iPaaS / Integrações",
      "TOTVS Techfin"
    ],
    "cenario_fisico": "Bancada e estação dedicada à demonstração de soluções transversais, inteligência artificial integrada e automação de fluxos corporativos.",
    "pitch": "As Soluções Cross conectam e potencializam todos os sistemas da TOTVS. Independentemente do setor — seja agro, manufatura, saúde, logística ou varejo —, nossas soluções transversais trazem Inteligência Artificial com a Carol, automação de fluxos de trabalho com o Fluig, assinatura eletrônica com validade jurídica e integração de plataformas com o iPaaS.",
    "dores_setor": [
      "Sistemas departamentais desconectados e perda de produtividade com processos manuais.",
      "Lentidão e insegurança na coleta de assinaturas e gestão física de documentos.",
      "Dificuldade em consolidar dados de múltiplos sistemas para gerar insights preditivos com IA."
    ],
    "roteiro_bancada": [
      "Apresente o conceito de soluções transversais que atendem a qualquer ERP ou segmento de negócio.",
      "Mostre na tela a automação de processos inteligentes e integrações entre diferentes plataformas.",
      "Destaque os benefícios de segurança jurídica, rapidez e redução de custos da assinatura eletrônica."
    ],
    "perguntas_visitante": [
      "Como é feita hoje a integração entre os diferentes sistemas e setores na sua empresa?",
      "Vocês já utilizam inteligência artificial ou fluxos digitais de aprovação no dia a dia?"
    ],
    "midias": {
      "fotos": [],
      "videos": []
    },
    "ultima_atualizacao": {
      "data": "05/10/2026, 18:29:16",
      "autor": "André Gianotti"
    },
    "credenciais": {
      "equipamento": "PC Soluções Cross",
      "usuario": "ens.experiencia@totvs.com.br",
      "senha": "Experienciastotvs@2026"
    },
    "foto_bancada": "",
    "equipamentos": [
      {
        "id": "eq_solucoes_cross_1",
        "titulo": "PC Soluções Cross",
        "descricao": "Usuário: ens.experiencia@totvs.com.br\nSenha: Experienciastotvs@2026",
        "foto": ""
      }
    ],
    "video_discurso": {
      "tipo": "url",
      "url": "",
      "titulo": "Vídeo do Discurso - SOLUÇÕES CROSS"
    },
    "personas": "",
    "principais_clientes": ""
  }
];
}

function getPlantonistasPadrao() {
  return {
  "especialistas": [
    {
      "id": "esp-1",
      "nome": "André Gianotti",
      "cargo": "Curador & Especialista Chefe do Espaço",
      "email": "andre.gianotti@totvs.com.br",
      "ramal": "4102",
      "avatar_cor": "bg-totvs-blue",
      "estacao_foco": "Visão Geral & Curadoria Executiva"
    },
    {
      "id": "esp-2",
      "nome": "Camila Santana",
      "cargo": "Especialista em Manufatura & MES PPI",
      "email": "camila.santana@totvs.com.br",
      "ramal": "4103",
      "avatar_cor": "bg-cyan-600",
      "estacao_foco": "Estação 02 (Manufatura) & Estação 04 (MES)"
    },
    {
      "id": "esp-3",
      "nome": "Lucas Ferreira",
      "cargo": "Especialista em Agro & Logística",
      "email": "lucas.ferreira@totvs.com.br",
      "ramal": "4104",
      "avatar_cor": "bg-emerald-600",
      "estacao_foco": "Estação 01 (Agro) & Estação 05 (Logística)"
    },
    {
      "id": "esp-4",
      "nome": "Mariana Lima",
      "cargo": "Especialista em Varejo & Moda",
      "email": "mariana.lima@totvs.com.br",
      "ramal": "4105",
      "avatar_cor": "bg-pink-600",
      "estacao_foco": "Estação 06 (Moda) & Estação 08 (Varejo Online)"
    },
    {
      "id": "esp-5",
      "nome": "Rafael Duarte",
      "cargo": "Especialista em Saúde & Backoffice",
      "email": "rafael.duarte@totvs.com.br",
      "ramal": "4106",
      "avatar_cor": "bg-sky-600",
      "estacao_foco": "Estação 03 (Backoffice) & Estação 09 (Clínicas)"
    },
    {
      "id": "esp-6",
      "nome": "Fernanda Torres",
      "cargo": "Especialista em Supermercados & Distribuição",
      "email": "fernanda.torres@totvs.com.br",
      "ramal": "4107",
      "avatar_cor": "bg-rose-600",
      "estacao_foco": "Estação 07 (Consinco) & Soluções Cross"
    },
    {
      "id": "esp-7",
      "nome": "Bruno Carvalho",
      "cargo": "Especialista em Mesa Interativa & Soluções Cross",
      "email": "bruno.carvalho@totvs.com.br",
      "ramal": "4108",
      "avatar_cor": "bg-indigo-600",
      "estacao_foco": "Estação 10 (Cross) & Estação 11 (Mesa Interativa)"
    },
    {
      "id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "cargo": "Especialista • Educacional",
      "email": "michel.rocha@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Educacional"
    },
    {
      "id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "cargo": "Especialista • Logistica",
      "email": "augusto.nascimento@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Logistica"
    },
    {
      "id": "esp-beatriz-cristina-figueiro",
      "nome": "BEATRIZ CRISTINA FIGUEIRO",
      "cargo": "Especialista • Varejo",
      "email": "beatriz.figueiro@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "cargo": "Especialista • Educacional",
      "email": "eduardo.thomaz@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Educacional"
    },
    {
      "id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "cargo": "Especialista • Distribuição",
      "email": "rafael.fsantejani@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Distribuição"
    },
    {
      "id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "cargo": "Especialista • Manufatura",
      "email": "bruno.cesilva@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Manufatura"
    },
    {
      "id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "cargo": "Especialista • Moda",
      "email": "b.nascimento@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Moda"
    },
    {
      "id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "cargo": "Especialista • Varejo",
      "email": "gilmara.venancio@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "cargo": "Especialista • Manufatura",
      "email": "douglas.filho@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Manufatura"
    },
    {
      "id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "cargo": "Especialista • Construção",
      "email": "karoline.honorio@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Construção"
    },
    {
      "id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "cargo": "Especialista • Varejo",
      "email": "fabio.fernando@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-manuel-igor-oliveira-dos-",
      "nome": "MANUEL IGOR OLIVEIRA DOS SANTOS",
      "cargo": "Especialista • Logística",
      "email": "manuel.santos@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Logística"
    },
    {
      "id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "cargo": "Especialista • ESG",
      "email": "gabriel.fsa@totvs.com.br",
      "ramal": "",
      "estacao_foco": "ESG"
    },
    {
      "id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "cargo": "Especialista • Prestadores",
      "email": "giovanna.silva@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Prestadores"
    },
    {
      "id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "cargo": "Especialista • Varejo",
      "email": "e.ciosak@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "cargo": "Especialista • Prestadores",
      "email": "j.kalmus@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Prestadores"
    },
    {
      "id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "cargo": "Especialista • Educacional",
      "email": "josi.souza@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Educacional"
    },
    {
      "id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "cargo": "Especialista • Prestadores",
      "email": "jose.wellington@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Prestadores"
    },
    {
      "id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "cargo": "Especialista • Manufatura",
      "email": "marcel.angelo@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Manufatura"
    },
    {
      "id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "cargo": "Especialista • Educacional",
      "email": "emerson.meneguel@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Educacional"
    },
    {
      "id": "esp-giilmara-venancio",
      "nome": "GiILMARA VENANCIO",
      "cargo": "Especialista • Varejo",
      "email": "silva.azfernando@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "cargo": "Especialista • Manufatura",
      "email": "juliano.marcato@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Manufatura"
    },
    {
      "id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "cargo": "Especialista • Moda",
      "email": "marilia.maciel@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Moda"
    },
    {
      "id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "cargo": "Especialista • Educacional",
      "email": "alberto.bem@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Educacional"
    },
    {
      "id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "cargo": "Especialista • Varejo",
      "email": "paulos.silva@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "cargo": "Especialista do Espaço Experiência",
      "email": "raiane.orizio@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Soluções TOTVS"
    },
    {
      "id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "cargo": "Especialista • ESG",
      "email": "camila.basilva@totvs.com.br",
      "ramal": "",
      "estacao_foco": "ESG"
    },
    {
      "id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "cargo": "Especialista • Manufatura",
      "email": "renato.engelmann@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Manufatura"
    },
    {
      "id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "cargo": "Especialista • Construção",
      "email": "lacava.renato@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Construção"
    },
    {
      "id": "esp-ricardo-angelo-reinaldi",
      "nome": "RICARDO ANGELO REINALDI",
      "cargo": "Especialista • Prestadores",
      "email": "ricardo.angelo@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Prestadores"
    },
    {
      "id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "cargo": "Especialista • Construção",
      "email": "rodrigo.gonzalez@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Construção"
    },
    {
      "id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "cargo": "Especialista • Logística",
      "email": "rodrigo.cesar@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Logística"
    },
    {
      "id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "cargo": "Especialista • Construção",
      "email": "stefany.fernandes@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Construção"
    },
    {
      "id": "esp-taina-renata-de-oliveira",
      "nome": "TAINA RENATA DE OLIVEIRA",
      "cargo": "Especialista • Varejo Online",
      "email": "taina.oliveira@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo Online"
    },
    {
      "id": "esp-ulisses-jose-covre-beltra",
      "nome": "ULISSES JOSE COVRE BELTRAME DA SILVA",
      "cargo": "Especialista • Construção",
      "email": "ulisses.jose@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Construção"
    },
    {
      "id": "esp-fernando-azevedo",
      "nome": "FERNANDO AZEVEDO",
      "cargo": "Especialista • Varejo",
      "email": "william.terentjvas@totvs.com.br",
      "ramal": "",
      "estacao_foco": "Varejo"
    },
    {
      "id": "esp-tati-macedo",
      "nome": "Tati Macedo",
      "cargo": "Especialista • ESG",
      "email": "tatiane.macedo@totvs.com.br",
      "ramal": "",
      "estacao_foco": "ESG"
    }
  ],
  "escalas": {
    "2026-01-05": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-06": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-07": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-08": {
      "especialista_id": "esp-beatriz-cristina-figueiro",
      "nome": "BEATRIZ CRISTINA FIGUEIRO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-09": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-12": {
      "especialista_id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-13": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-14": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-15": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-16": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-19": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-20": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-21": {
      "especialista_id": "esp-manuel-igor-oliveira-dos-",
      "nome": "MANUEL IGOR OLIVEIRA DOS SANTOS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-22": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-23": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-26": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-27": {
      "especialista_id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-28": {
      "especialista_id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-29": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-01-30": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-02": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-03": {
      "especialista_id": "esp-giilmara-venancio",
      "nome": "GiILMARA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-04": {
      "especialista_id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-05": {
      "especialista_id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-06": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-09": {
      "especialista_id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-10": {
      "especialista_id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-11": {
      "especialista_id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-12": {
      "especialista_id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-13": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-16": {
      "especialista_id": null,
      "nome": "Espaço Fechado",
      "turno": "Feriado",
      "status_rotulo": "Espaço Fechado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-02-17": {
      "especialista_id": null,
      "nome": "Espaço Fechado",
      "turno": "Feriado",
      "status_rotulo": "Espaço Fechado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-02-18": {
      "especialista_id": null,
      "nome": "Espaço Fechado",
      "turno": "Feriado",
      "status_rotulo": "Espaço Fechado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-02-19": {
      "especialista_id": "esp-ricardo-angelo-reinaldi",
      "nome": "RICARDO ANGELO REINALDI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-20": {
      "especialista_id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-23": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-24": {
      "especialista_id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-25": {
      "especialista_id": "esp-taina-renata-de-oliveira",
      "nome": "TAINA RENATA DE OLIVEIRA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-26": {
      "especialista_id": "esp-ulisses-jose-covre-beltra",
      "nome": "ULISSES JOSE COVRE BELTRAME DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-02-27": {
      "especialista_id": "esp-fernando-azevedo",
      "nome": "FERNANDO AZEVEDO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-02": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-03": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-04": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-05": {
      "especialista_id": "esp-beatriz-cristina-figueiro",
      "nome": "BEATRIZ CRISTINA FIGUEIRO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-06": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-09": {
      "especialista_id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-10": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-11": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-12": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-13": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-16": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-17": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-18": {
      "especialista_id": "esp-fernando-azevedo-soares-d",
      "nome": "FERNANDO AZEVEDO SOARES DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-19": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-20": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-23": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-24": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-25": {
      "especialista_id": "esp-rodrigo-cesar",
      "nome": "RODRIGO CESAR",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-26": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-27": {
      "especialista_id": "esp-camila-barbosa",
      "nome": "CAMILA BARBOSA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-30": {
      "especialista_id": "esp-bruno-nascimento",
      "nome": "BRUNO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-03-31": {
      "especialista_id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-01": {
      "especialista_id": "esp-igor-costa",
      "nome": "IGOR COSTA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-02": {
      "especialista_id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-03": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-04-06": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-07": {
      "especialista_id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-08": {
      "especialista_id": "esp-igor-costa",
      "nome": "IGOR COSTA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-09": {
      "especialista_id": "esp-taina-renata-de-oliveira",
      "nome": "TAINA RENATA DE OLIVEIRA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-10": {
      "especialista_id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-13": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-14": {
      "especialista_id": "esp-ricardo-angelo-reinaldi",
      "nome": "RICARDO ANGELO REINALDI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-15": {
      "especialista_id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-16": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-17": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-20": {
      "especialista_id": null,
      "nome": "Ponte Feriado",
      "turno": "Feriado",
      "status_rotulo": "Ponte Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-04-21": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-04-22": {
      "especialista_id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-23": {
      "especialista_id": "esp-ulisses-jose-covre-beltra",
      "nome": "ULISSES JOSE COVRE BELTRAME DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-24": {
      "especialista_id": "esp-william-terentjvas",
      "nome": "WILLIAM TERENTJVAS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-27": {
      "especialista_id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-28": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-29": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-04-30": {
      "especialista_id": "esp-beatriz-cristina-figueiro",
      "nome": "BEATRIZ CRISTINA FIGUEIRO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-01": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-05-04": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-05": {
      "especialista_id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-06": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-07": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-08": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-11": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-12": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-13": {
      "especialista_id": "esp-emerson-meneguel",
      "nome": "EMERSON MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-14": {
      "especialista_id": "esp-fernando-azevedo-soares-d",
      "nome": "FERNANDO AZEVEDO SOARES DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-15": {
      "especialista_id": "esp-gabriel-fernandes",
      "nome": "Gabriel Fernandes",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-18": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-19": {
      "especialista_id": "esp-igor-pinheiro-costa",
      "nome": "Igor Pinheiro Costa",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-20": {
      "especialista_id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-21": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-22": {
      "especialista_id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-25": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-26": {
      "especialista_id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-27": {
      "especialista_id": "esp-manuel-igor-oliveira-dos-",
      "nome": "MANUEL IGOR OLIVEIRA DOS SANTOS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-28": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-05-29": {
      "especialista_id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-01": {
      "especialista_id": "esp-ulisses-jose-covre-beltra",
      "nome": "ULISSES JOSE COVRE BELTRAME DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-02": {
      "especialista_id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-03": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-04": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-06-05": {
      "especialista_id": null,
      "nome": "Ponte Feriado",
      "turno": "Feriado",
      "status_rotulo": "Ponte Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-06-08": {
      "especialista_id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-09": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-10": {
      "especialista_id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-11": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-12": {
      "especialista_id": "esp-william-terentjvas",
      "nome": "WILLIAM TERENTJVAS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-15": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-16": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-17": {
      "especialista_id": "esp-taina-renata-de-oliveira",
      "nome": "TAINA RENATA DE OLIVEIRA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-18": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-19": {
      "especialista_id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-22": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-23": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-24": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-25": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-26": {
      "especialista_id": "esp-igor-costa",
      "nome": "Igor Costa",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-29": {
      "especialista_id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-06-30": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-01": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-02": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-03": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-06": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-07": {
      "especialista_id": "esp-fernando-azevedo-soares-d",
      "nome": "FERNANDO AZEVEDO SOARES DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-08": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-09": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-07-10": {
      "especialista_id": null,
      "nome": "Ponte Feriado",
      "turno": "Feriado",
      "status_rotulo": "Ponte Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-07-13": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-14": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-15": {
      "especialista_id": "esp-there",
      "nome": "There",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-16": {
      "especialista_id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-17": {
      "especialista_id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-20": {
      "especialista_id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-21": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-22": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-23": {
      "especialista_id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-24": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-27": {
      "especialista_id": "esp-manuel-igor-oliveira-dos-",
      "nome": "MANUEL IGOR OLIVEIRA DOS SANTOS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-28": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-29": {
      "especialista_id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-30": {
      "especialista_id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-07-31": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-03": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-04": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-05": {
      "especialista_id": "esp-igor",
      "nome": "IGOR",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-06": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-07": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-10": {
      "especialista_id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-11": {
      "especialista_id": "esp-taina-renata-de-oliveira",
      "nome": "TAINA RENATA DE OLIVEIRA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-12": {
      "especialista_id": "esp-josi",
      "nome": "JOSI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-13": {
      "especialista_id": "esp-william-terentjvas",
      "nome": "WILLIAM TERENTJVAS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-14": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-17": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-18": {
      "especialista_id": "esp-manuel-igor-oliveira-dos-",
      "nome": "MANUEL IGOR OLIVEIRA DOS SANTOS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-19": {
      "especialista_id": "esp-kalmus",
      "nome": "KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-20": {
      "especialista_id": "esp-vit-ria",
      "nome": "Vitória",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-21": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-24": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-25": {
      "especialista_id": "esp-camila-barbosa-da-silva",
      "nome": "CAMILA BARBOSA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-26": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-27": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-28": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-08-31": {
      "especialista_id": "esp-fernando-azevedo-soares-d",
      "nome": "FERNANDO AZEVEDO SOARES DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-01": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-02": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-03": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-04": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-07": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-09-08": {
      "especialista_id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-09": {
      "especialista_id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-10": {
      "especialista_id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-11": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-14": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-15": {
      "especialista_id": "esp-marilia-de-lima-maciel",
      "nome": "MARILIA DE LIMA MACIEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-16": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-17": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-18": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-21": {
      "especialista_id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-22": {
      "especialista_id": "esp-igor-costa",
      "nome": "IGOR COSTA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-23": {
      "especialista_id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-24": {
      "especialista_id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-25": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-28": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-29": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-09-30": {
      "especialista_id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-01": {
      "especialista_id": "esp-stefany-barros-fernandes-",
      "nome": "STEFANY BARROS FERNANDES + ANA CLAUDIA ALMEIDA VALERIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-02": {
      "especialista_id": "esp-taina-renata-de-oliveira-",
      "nome": "TAINA RENATA DE OLIVEIRA + Camila",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-05": {
      "especialista_id": "esp-gianotti",
      "nome": "Gianotti",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-06": {
      "especialista_id": "esp-v-t-ria-tereza",
      "nome": "VÍTÓRIA TEREZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-07": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-08": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-09": {
      "especialista_id": "esp-eduardo-thomaz",
      "nome": "EDUARDO THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-12": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-10-13": {
      "especialista_id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-14": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-15": {
      "especialista_id": "esp-tati",
      "nome": "TATI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-16": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-19": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-20": {
      "especialista_id": "esp-marcel-rezk-de-angelo",
      "nome": "MARCEL REZK DE ANGELO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-21": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-22": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-23": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-26": {
      "especialista_id": "esp-marcos-wallace",
      "nome": "Marcos Wallace",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-27": {
      "especialista_id": "esp-gabriel-fernandes-dias-de",
      "nome": "GABRIEL FERNANDES DIAS DE SA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-28": {
      "especialista_id": "esp-gilmara-silva-venancio",
      "nome": "GILMARA SILVA VENANCIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-29": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-10-30": {
      "especialista_id": "esp-jorge-kalmus",
      "nome": "JORGE KALMUS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-02": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-11-03": {
      "especialista_id": "esp-josi-dinora-de-souza",
      "nome": "JOSI DINORA DE SOUZA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-04": {
      "especialista_id": "esp-jose-wellington-alves-lim",
      "nome": "JOSE WELLINGTON ALVES LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-05": {
      "especialista_id": "esp-juliano-marcato",
      "nome": "JULIANO MARCATO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-06": {
      "especialista_id": "esp-karoline-moreira-honorio",
      "nome": "KAROLINE MOREIRA HONORIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-09": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-10": {
      "especialista_id": "esp-marcos-wallace",
      "nome": "MARCOS WALLACE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-11": {
      "especialista_id": "esp-douglas",
      "nome": "DOUGLAS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-12": {
      "especialista_id": "esp-michel-ribeiro-rocha",
      "nome": "MICHEL RIBEIRO ROCHA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-13": {
      "especialista_id": "esp-paulo-sergio-da-silva",
      "nome": "PAULO SERGIO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-16": {
      "especialista_id": "esp-rafael-fonseca-santejani",
      "nome": "RAFAEL FONSECA SANTEJANI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-17": {
      "especialista_id": "esp-raiane-da-silva-teodoro-o",
      "nome": "RAIANE DA SILVA TEODORO ORIZIO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-18": {
      "especialista_id": "esp-renato-engelmann",
      "nome": "RENATO ENGELMANN",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-19": {
      "especialista_id": "esp-renato-lacava",
      "nome": "RENATO LACAVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-20": {
      "especialista_id": null,
      "nome": "Feriado",
      "turno": "Feriado",
      "status_rotulo": "Feriado",
      "observacoes": "",
      "tipo": "feriado"
    },
    "2026-11-23": {
      "especialista_id": "esp-giovanna-florentino-ferre",
      "nome": "GIOVANNA FLORENTINO FERREIRA DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-24": {
      "especialista_id": "esp-rodrigo-paul-quinonez-gon",
      "nome": "RODRIGO PAUL QUINONEZ GONZALEZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-25": {
      "especialista_id": "esp-rodrigo-cesar-duarte",
      "nome": "RODRIGO CESAR DUARTE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-26": {
      "especialista_id": "esp-stefany-barros-fernandes",
      "nome": "STEFANY BARROS FERNANDES",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-27": {
      "especialista_id": "esp-marcos-wallace",
      "nome": "MARCOS WALLACE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-11-30": {
      "especialista_id": "esp-emerson",
      "nome": "EMERSON",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-01": {
      "especialista_id": "esp-william-terentjvas",
      "nome": "WILLIAM TERENTJVAS",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-02": {
      "especialista_id": "esp-alberto-bem-de-lima",
      "nome": "ALBERTO BEM DE LIMA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-03": {
      "especialista_id": "esp-augusto-caetano-araujo-do",
      "nome": "AUGUSTO CAETANO ARAUJO DO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-04": {
      "especialista_id": "esp-andre-sousa-lopes-gianott",
      "nome": "ANDRE SOUSA LOPES GIANOTTI",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-07": {
      "especialista_id": "esp-vit-ria-tereza",
      "nome": "Vitória Tereza",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-08": {
      "especialista_id": "esp-douglas-cavalcante-filho",
      "nome": "DOUGLAS CAVALCANTE FILHO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-09": {
      "especialista_id": "esp-tati-macedo",
      "nome": "Tati Macedo",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-10": {
      "especialista_id": "esp-bruno-cesar-ravacci-silva",
      "nome": "BRUNO CESAR RAVACCI SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-11": {
      "especialista_id": "esp-bruno-eustaquio-nasciment",
      "nome": "BRUNO EUSTAQUIO NASCIMENTO",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-14": {
      "especialista_id": "esp-eduardo-ciosak",
      "nome": "EDUARDO CIOSAK",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-15": {
      "especialista_id": "esp-eduardo-santos-thomaz",
      "nome": "EDUARDO SANTOS THOMAZ",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-16": {
      "especialista_id": "esp-emerson-de-souza-meneguel",
      "nome": "EMERSON DE SOUZA MENEGUEL",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-17": {
      "especialista_id": "esp-fabio-fernando-da-silva",
      "nome": "FABIO FERNANDO DA SILVA",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    },
    "2026-12-18": {
      "especialista_id": "esp-marcos-wallace",
      "nome": "MARCOS WALLACE",
      "turno": "08:00 as 17:30",
      "observacoes": "",
      "tipo": "normal"
    }
  }
};
}


/**
 * ============================================================================
 * GESTÃO DE CONVITES DE ADMINISTRADORES
 * ============================================================================
 */
function verificarConvite(token) {
  var tokenLimpo = String(token || "").trim();
  if (!tokenLimpo) return { success: false, message: "Token de convite não informado." };

  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Convites");
    if (aba) {
      var dados = aba.getDataRange().getValues();
      for (var i = 1; i < dados.length; i++) {
        var r = dados[i];
        if (String(r[1]).trim() === tokenLimpo) {
          var jaUtilizado = String(r[6]) === "true";
          if (jaUtilizado) {
            return { success: false, message: "Este link de convite já foi utilizado anteriormente." };
          }
          var perfilConv = r[7] ? String(r[7]).trim() : (tokenLimpo.startsWith("pmm_") ? "pmm" : "adm");
          return {
            success: true,
            convite: {
              id: String(r[0]),
              token: String(r[1]),
              email: String(r[2]),
              nome: String(r[3]),
              perfil: perfilConv,
              criado_por: String(r[4] || "André Gianotti"),
              criado_em: String(r[5] || ""),
              utilizado: false
            }
          };
        }
      }
      // Se a aba Convites existe e o token não foi localizado, foi excluído/cancelado
      return { success: false, message: "Este link de convite é inválido ou foi cancelado pelo administrador." };
    }
  } catch(e) {}

  return { success: false, message: "Este link de convite é inválido ou foi cancelado pelo administrador." };
}

function aceitarConvite(dados) {
  var token = String(dados.token || "").trim();
  var nome = String(dados.nome || "").trim();
  var email = String(dados.email || "").toLowerCase().trim();
  var senhaProvisoria = String(dados.senhaProvisoria || "").trim();
  var novaSenha = String(dados.novaSenha || "").trim();

  if (senhaProvisoria !== "totvs123" && senhaProvisoria !== "123") {
    return { success: false, message: "A senha provisória padrão é totvs123. Verifique e tente novamente." };
  }

  if (novaSenha.length < 6) {
    return { success: false, message: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  var temLetra = /[a-zA-Z]/.test(novaSenha);
  var temNumero = /[0-9]/.test(novaSenha);
  if (!temLetra || !temNumero) {
    return { success: false, message: "A nova senha deve conter letras e números (alfanumérica)." };
  }

  var idNovo = "usr-" + new Date().getTime();
  var agora = new Date().toLocaleString("pt-BR");
  var perfil = token.startsWith("esp_") ? "especialista" : (token.startsWith("pmm_") ? "pmm" : "adm");
  
  try {
    var ss = getSpreadsheet();
    
    // 1. Marcar convite como utilizado e descobrir perfil gravado
    var abaConv = ss.getSheetByName("Convites");
    if (abaConv) {
      var dConv = abaConv.getDataRange().getValues();
      for (var i = 1; i < dConv.length; i++) {
        if (String(dConv[i][1]).trim() === token) {
          abaConv.getRange(i + 1, 7).setValue(true);
          if (dConv[i][7]) {
            var pStr = String(dConv[i][7]).toLowerCase().trim();
            perfil = pStr === "adm" ? "adm" : (pStr === "especialista" ? "especialista" : "pmm");
          }
          break;
        }
      }
    }

    var cargo = perfil === "adm" ? "Administrador" : (perfil === "especialista" ? "Especialista do Espaço Experiência" : "PMM (Gestor de Segmento)");
    var novoUsuario = {
      id: idNovo,
      nome: nome,
      email: email,
      cargo: cargo,
      perfil: perfil,
      tipo: "administrador",
      dono_produto: false,
      precisa_trocar_senha: false,
      foto: String(dados.foto || "").trim(),
      criado_em: agora
    };

    // 2. Inserir novo usuário na aba Usuarios
    var abaUser = ss.getSheetByName("Usuarios");
    if (!abaUser) {
      abaUser = ss.insertSheet("Usuarios");
      abaUser.appendRow(["ID", "Email", "Nome", "Cargo", "Senha", "DonoProduto", "PrecisaTrocarSenha", "Foto", "CriadoEm", "Perfil"]);
      abaUser.getRange("A1:J1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      abaUser.appendRow(["adm-001", "andre.gianotti@totvs.com.br", "André Gianotti", "Dono do Produto", "totvs123", true, false, "", "16/09/2026", "adm"]);
    }
    abaUser.appendRow([idNovo, email, nome, cargo, novaSenha, false, false, "", agora, perfil]);

    // 3. Registrar log de auditoria
    registrarLogAcesso(nome, "Convite ativado com sucesso. Novo usuário (" + cargo + ") registrado.");

    return {
      success: true,
      message: "Perfil ativado com sucesso!",
      usuario: novoUsuario
    };

  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Permite que um usuário (ADM ou PMM) altere sua própria senha
 */
function alterarSenhaUsuario(email, novaSenha) {
  try {
    var emailLimpo = String(email || "").toLowerCase().trim();
    var senhaLimpa = String(novaSenha || "").trim();

    if (!emailLimpo || !senhaLimpa) {
      return { success: false, message: "E-mail e nova senha são obrigatórios." };
    }
    if (senhaLimpa.length < 6 || !/[a-zA-Z]/.test(senhaLimpa) || !/[0-9]/.test(senhaLimpa)) {
      return { success: false, message: "A nova senha deve possuir no mínimo 6 caracteres e conter letras e números." };
    }

    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: false, message: "Aba de usuários não encontrada." };

    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][1]).toLowerCase().trim() === emailLimpo) {
        aba.getRange(i + 1, 5).setValue(senhaLimpa);
        registrarLogAcesso(String(dados[i][2]), "Alteração da própria senha realizada com sucesso.");
        return { success: true, message: "Senha alterada com sucesso!" };
      }
    }
    return { success: false, message: "Usuário não encontrado na base corporativa." };
  } catch(e) {
    return { success: false, message: e.message };
  }
}


/**
 * Salva a foto de perfil do administrador na planilha Google
 */
function salvarAvatarAdmin(email, base64Data) {
  var emailLimpo = String(email || "").toLowerCase().trim();
  if (!emailLimpo) return { success: false, message: "E-mail não informado." };

  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) {
      aba = ss.insertSheet("Usuarios");
      aba.appendRow(["ID", "Email", "Nome", "Cargo", "Senha", "DonoProduto", "PrecisaTrocarSenha", "Foto", "CriadoEm"]);
      aba.getRange("A1:I1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      aba.appendRow(["adm-001", "andre.gianotti@totvs.com.br", "André Gianotti", "Dono do Produto", "totvs123", true, false, "", "16/09/2026"]);
    }

    var dados = aba.getDataRange().getValues();
    var usuarioAtualizado = null;
    var linhaEncontrada = -1;

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][1]).toLowerCase().trim() === emailLimpo) {
        linhaEncontrada = i + 1;
        aba.getRange(linhaEncontrada, 8).setValue(base64Data);
        usuarioAtualizado = {
          id: String(dados[i][0]),
          email: String(dados[i][1]),
          nome: String(dados[i][2]),
          cargo: String(dados[i][3] || "Administrador"),
          tipo: "administrador",
          dono_produto: String(dados[i][5]) === "true",
          precisa_trocar_senha: String(dados[i][6]) === "true",
          foto: base64Data
        };
        break;
      }
    }

    if (!usuarioAtualizado && emailLimpo === "andre.gianotti@totvs.com.br") {
      aba.appendRow(["adm-001", "andre.gianotti@totvs.com.br", "André Gianotti", "Dono do Produto", "totvs123", true, false, base64Data, "16/09/2026"]);
      usuarioAtualizado = {
        id: "adm-001",
        email: "andre.gianotti@totvs.com.br",
        nome: "André Gianotti",
        cargo: "Dono do Produto",
        tipo: "administrador",
        dono_produto: true,
        precisa_trocar_senha: false,
        foto: base64Data
      };
    }

    if (!usuarioAtualizado) {
      usuarioAtualizado = {
        id: "usr-" + new Date().getTime(),
        email: emailLimpo,
        nome: emailLimpo.split('@')[0],
        cargo: "Administrador",
        tipo: "administrador",
        dono_produto: false,
        foto: base64Data
      };
    }

    registrarLogAcesso(usuarioAtualizado.nome, "Foto de perfil do administrador atualizada com sucesso");
    return { success: true, usuario: usuarioAtualizado };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

/**
 * Alias de compatibilidade com o front-end para upload de foto
 */
function atualizarFotoUsuario(email, base64Data) {
  return salvarAvatarAdmin(email, base64Data);
}

/**
 * Alterna o status (Ativo / Desativado) de um perfil na planilha Google
 */
function alternarStatusUsuario(id, email, autorEmail, autorNome) {
  try {
    var emailLimpo = String(email || "").toLowerCase().trim();
    if (emailLimpo === "andre.gianotti@totvs.com.br") {
      return { success: false, message: "Ação bloqueada: O Dono do Produto possui imunidade e não pode ser desativado." };
    }
    if (emailLimpo === String(autorEmail || "").toLowerCase().trim()) {
      return { success: false, message: "Operação não permitida: Você não pode desativar a sua própria conta em uso." };
    }

    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: false, message: "Aba de usuários não encontrada." };

    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id) || String(dados[i][1]).toLowerCase().trim() === emailLimpo) {
        var statusAtual = dados[i][10] === undefined || dados[i][10] === "" || String(dados[i][10]).toLowerCase() === "true";
        var novoStatus = !statusAtual;
        aba.getRange(i + 1, 11).setValue(novoStatus);
        
        var nomeAlvo = String(dados[i][2]);
        registrarLogAcesso(autorNome || "Administrador", "Status do perfil (" + nomeAlvo + ") alterado para: " + (novoStatus ? "Ativo" : "Desativado"), autorEmail || "", "adm");
        return {
          success: true,
          message: "Perfil de \"" + nomeAlvo + "\" foi " + (novoStatus ? "reativado" : "desativado") + " com sucesso!",
          ativo: novoStatus
        };
      }
    }
    return { success: false, message: "Perfil não encontrado na planilha." };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Reseta a senha de um perfil para 'totvs123' na planilha Google com troca obrigatória
 */
function resetarSenhaUsuario(id, email, autorEmail, autorNome) {
  try {
    var emailLimpo = String(email || "").toLowerCase().trim();
    if (emailLimpo === "andre.gianotti@totvs.com.br") {
      return { success: false, message: "Ação bloqueada: A senha do Dono do Produto possui imunidade e não pode ser redefinida por terceiros." };
    }

    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: false, message: "Aba de usuários não encontrada." };

    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id) || String(dados[i][1]).toLowerCase().trim() === emailLimpo) {
        aba.getRange(i + 1, 5).setValue("totvs123");
        aba.getRange(i + 1, 7).setValue(true); // PrecisaTrocarSenha = true
        
        var nomeAlvo = String(dados[i][2]);
        registrarLogAcesso(autorNome || "Administrador", "Reset de senha do perfil (" + nomeAlvo + ") para totvs123 com troca obrigatória.", autorEmail || "", "adm");
        return {
          success: true,
          message: "Senha de \"" + nomeAlvo + "\" redefinida para a inicial padrão (totvs123) com sucesso!",
          senhaPadrao: "totvs123"
        };
      }
    }
    return { success: false, message: "Perfil não encontrado na planilha." };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * Cadastra uma nova senha definitiva e remove a flag PrecisaTrocarSenha
 */
function definirNovaSenhaObrigatoria(email, novaSenha) {
  try {
    var emailLimpo = String(email || "").toLowerCase().trim();
    var senhaLimpa = String(novaSenha || "").trim();

    if (!emailLimpo || !senhaLimpa) {
      return { success: false, message: "E-mail e nova senha são obrigatórios." };
    }
    if (senhaLimpa.length < 6 || !/[a-zA-Z]/.test(senhaLimpa) || !/[0-9]/.test(senhaLimpa)) {
      return { success: false, message: "A nova senha deve possuir no mínimo 6 caracteres e conter letras e números." };
    }

    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: false, message: "Aba de usuários não encontrada." };

    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][1]).toLowerCase().trim() === emailLimpo) {
        aba.getRange(i + 1, 5).setValue(senhaLimpa);
        aba.getRange(i + 1, 7).setValue(false); // PrecisaTrocarSenha = false
        var nomeAlvo = String(dados[i][2]);
        registrarLogAcesso(nomeAlvo, "Nova senha pessoal cadastrada com sucesso após reset.", emailLimpo, String(dados[i][9] || "adm"));
        return {
          success: true,
          message: "Nova senha cadastrada com sucesso!",
          usuario: {
            id: String(dados[i][0]),
            email: emailLimpo,
            nome: nomeAlvo,
            cargo: String(dados[i][3] || "Administrador"),
            tipo: "administrador",
            dono_produto: String(dados[i][5]) === "true",
            precisa_trocar_senha: false,
            foto: String(dados[i][7] || ""),
            perfil: String(dados[i][9] || "adm")
          }
        };
      }
    }
    return { success: false, message: "Usuário não encontrado na base corporativa." };
  } catch(e) {
    return { success: false, message: e.message };
  }
}


/**
 * Consulta a Chave Mestra do Perfil Especialista
 */
function obterModoAuthEspecialista() {
  try {
    var val = PropertiesService.getScriptProperties().getProperty("AUTH_ESPECIALISTA_OBRIGATORIA");
    return {
      success: true,
      auth_especialista_obrigatoria: val === "true"
    };
  } catch (err) {
    return {
      success: false,
      auth_especialista_obrigatoria: false,
      error: err.message
    };
  }
}

/**
 * Altera a Chave Mestra do Perfil Especialista (Exclusivo Dono do Produto)
 */
function salvarModoAuthEspecialista(obrigatoria, autorEmail, autorNome) {
  try {
    var email = (autorEmail || "").trim().toLowerCase();
    var isDono = email === "andre.gianotti@totvs.com.br";
    if (!isDono) {
      var ativo = obterUsuarioAtivo();
      if (ativo && (ativo.email === "andre.gianotti@totvs.com.br" || ativo.dono_produto)) {
        isDono = true;
      }
    }
    if (!isDono) {
      return {
        success: false,
        message: "Ação restrita: Somente o Dono do Produto (andre.gianotti@totvs.com.br) tem autorização para alterar a chave do Perfil Especialista."
      };
    }

    var boolVal = obrigatoria === true;
    PropertiesService.getScriptProperties().setProperty("AUTH_ESPECIALISTA_OBRIGATORIA", boolVal ? "true" : "false");

    // Auditoria
    try {
      var ss = getSpreadsheet();
      var sheetAudit = ss.getSheetByName("Logs_Auditoria");
      if (sheetAudit) {
        var id = "aud-" + new Date().getTime();
        var agora = new Date();
        var dataStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
        var horaStr = Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss");
        var acao = boolVal ? "Ativação do Modo Estrito (Login Obrigatório para Especialistas)" : "Ativação do Modo Aberto (Acesso Especialista Sem Login)";
        var detalhes = "A chave mestra do Perfil Especialista foi alterada para " + (boolVal ? "MODO ESTRITO (exige login individual)" : "MODO ABERTO (usuários deslogados herdam privilégios de especialista)") + " pelo Dono do Produto.";
        sheetAudit.appendRow([id, autorNome || "André Gianotti", email || "andre.gianotti@totvs.com.br", "adm", "governanca", "Governança do Showroom", acao, dataStr, horaStr, agora.getTime(), detalhes]);
      }
    } catch (errAudit) {}

    return {
      success: true,
      message: "Chave do Perfil Especialista alterada para " + (boolVal ? "Modo Estrito (Login Obrigatório)" : "Modo Aberto (Sem Login Obrigatório)") + " com sucesso!",
      auth_especialista_obrigatoria: boolVal
    };
  } catch (err) {
    return { success: false, message: "Erro ao salvar modo de autenticação: " + err.message };
  }
}

/**
 * Atualiza Nome e/ou Senha de qualquer perfil (autoedição ou edição por ADM)
 */
function atualizarPerfilUsuario(dados) {
  try {
    var emailLimpo = String(dados.email || "").toLowerCase().trim();
    var nomeLimpo = String(dados.nome || "").trim();
    var senhaLimpa = String(dados.novaSenha || "").trim();
    var autorEmail = String(dados.autorEmail || "").toLowerCase().trim();
    var autorNome = String(dados.autorNome || "Administrador").trim();

    if (!emailLimpo) {
      return { success: false, message: "E-mail do perfil é obrigatório." };
    }

    // Validação de Imunidade do Dono do Produto
    var isAlvoDono = emailLimpo === "andre.gianotti@totvs.com.br";
    if (isAlvoDono && autorEmail !== "andre.gianotti@totvs.com.br") {
      var ativo = obterUsuarioAtivo();
      if (!ativo || (ativo.email !== "andre.gianotti@totvs.com.br" && !ativo.dono_produto)) {
        return {
          success: false,
          message: "Ação restrita: Os dados do Dono do Produto possuem imunidade total e só podem ser alterados por ele mesmo."
        };
      }
    }

    if (senhaLimpa) {
      if (senhaLimpa.length < 6 || !/[a-zA-Z]/.test(senhaLimpa) || !/[0-9]/.test(senhaLimpa)) {
        return { success: false, message: "A nova senha deve possuir no mínimo 6 caracteres e conter letras e números." };
      }
    }

    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: false, message: "Aba de usuários não encontrada." };

    var rows = aba.getDataRange().getValues();
    for (var i = 1; i < rows.length; i++) {
      if (String(rows[i][1]).toLowerCase().trim() === emailLimpo) {
        var nomeAntigo = String(rows[i][2]);
        var detalhesArr = [];

        if (nomeLimpo && nomeLimpo !== nomeAntigo) {
          aba.getRange(i + 1, 3).setValue(nomeLimpo);
          detalhesArr.push("Nome alterado de \"" + nomeAntigo + "\" para \"" + nomeLimpo + "\"");
        }
        if (senhaLimpa) {
          aba.getRange(i + 1, 5).setValue(senhaLimpa);
          aba.getRange(i + 1, 7).setValue(false); // remove precisa_trocar_senha
          detalhesArr.push("Nova senha cadastrada com sucesso");
        }

        // Auditoria
        try {
          var sheetAudit = ss.getSheetByName("Logs_Auditoria") || ss.getSheetByName("LogsAuditoria") || ss.getSheetByName("Logs");
          if (sheetAudit) {
            var id = "aud-" + new Date().getTime();
            var agora = new Date();
            var dataStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
            var horaStr = Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss");
            var acao = autorEmail === emailLimpo ? "Atualização de Perfil Próprio" : "Edição de Perfil de " + (nomeLimpo || nomeAntigo);
            var perfilAlvo = String(rows[i][9] || "adm");
            sheetAudit.appendRow([id, autorNome, autorEmail, perfilAlvo, "usuarios", "Gestão de Perfis", acao, dataStr, horaStr, agora.getTime(), detalhesArr.join(" • ") || "Dados cadastrais atualizados."]);
          }
        } catch(errAudit) {}

        var isAtivo = rows[i][10] === undefined || rows[i][10] === "" || String(rows[i][10]).toLowerCase() === "true";
        return {
          success: true,
          message: "Perfil atualizado com sucesso!",
          usuario: {
            id: String(rows[i][0]),
            email: emailLimpo,
            nome: nomeLimpo || nomeAntigo,
            cargo: String(rows[i][3] || "Administrador"),
            tipo: "administrador",
            dono_produto: String(rows[i][5]) === "true" || emailLimpo === "andre.gianotti@totvs.com.br",
            ativo: isAtivo,
            precisa_trocar_senha: false,
            foto: String(rows[i][7] || ""),
            perfil: String(rows[i][9] || "adm")
          }
        };
      }
    }

    if (emailLimpo === "andre.gianotti@totvs.com.br") {
      aba.appendRow(["adm-001", "andre.gianotti@totvs.com.br", nomeLimpo || "André Gianotti", "Dono do Produto", senhaLimpa || "totvs123", true, false, "", "16/09/2026", "adm", true]);
      return {
        success: true,
        message: "Perfil do Dono do Produto atualizado com sucesso!",
        usuario: {
          id: "adm-001",
          email: "andre.gianotti@totvs.com.br",
          nome: nomeLimpo || "André Gianotti",
          cargo: "Dono do Produto",
          tipo: "administrador",
          dono_produto: true,
          ativo: true,
          precisa_trocar_senha: false,
          foto: "",
          perfil: "adm"
        }
      };
    }

    return { success: false, message: "Perfil não encontrado na planilha de usuários." };
  } catch(e) {
    return { success: false, message: e.message };
  }
}

/**
 * ============================================================================
 * GESTÃO DE CONFIGURAÇÃO DE LEMBRETES DIÁRIOS (EXCLUSIVO DONO DO PRODUTO)
 * ============================================================================
 */
function getLembretesPadrao() {
  return {
    ativo: true,
    turno1: {
      horario: "13:00",
      titulo: "⚠️ Atenção ! Você não registrou nenhum visitante até o momento ! 13:00",
      subtitulo: "Lembrete das 13:00 • Ajude a manter os dados de visitação do Espaço Experiência em dia.",
      ativo: true
    },
    turno2: {
      horario: "17:00",
      titulo: "⚠️ Atenção ! Você não registrou nenhum visitante até o momento ! 17:00",
      subtitulo: "Lembrete das 17:00 • Ajude a manter os dados de visitação do Espaço Experiência em dia.",
      pergunta_confirmacao: "Você tem certeza que não houve nenhum visitante?",
      subtitulo_confirmacao: "Confirmação de encerramento do dia no Espaço Experiência.",
      ativo: true
    },
    atualizado_em: "Padrão do Sistema",
    atualizado_por: "Sistema TOTVS"
  };
}

function obterConfigLembretes() {
  try {
    var raw = PropertiesService.getScriptProperties().getProperty("CONFIG_LEMBRETES");
    if (raw) {
      var parsed = JSON.parse(raw);
      if (parsed && parsed.turno1 && parsed.turno2) {
        return parsed;
      }
    }
  } catch (e) {}
  return getLembretesPadrao();
}

function salvarConfigLembretes(configData, autorEmail, autorNome) {
  try {
    var emailLimpo = String(autorEmail || "").toLowerCase().trim();
    var usuarioAtivo = obterUsuarioAtivo();
    var isDono = emailLimpo === "andre.gianotti@totvs.com.br" || Boolean(usuarioAtivo && usuarioAtivo.dono_produto);

    if (!isDono) {
      return { 
        success: false, 
        message: "Acesso negado: Apenas o Dono do Produto possui permissão para alterar as configurações de lembretes diários." 
      };
    }

    if (!configData || !configData.turno1 || !configData.turno2) {
      return { success: false, message: "Estrutura de configuração de lembretes inválida." };
    }

    var agora = new Date();
    var dataHoraStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy HH:mm:ss");

    var safeConfig = {
      ativo: configData.ativo !== false,
      turno1: {
        horario: String(configData.turno1.horario || "13:00").trim(),
        titulo: String(configData.turno1.titulo || "").trim(),
        subtitulo: String(configData.turno1.subtitulo || "").trim(),
        ativo: configData.turno1.ativo !== false
      },
      turno2: {
        horario: String(configData.turno2.horario || "17:00").trim(),
        titulo: String(configData.turno2.titulo || "").trim(),
        subtitulo: String(configData.turno2.subtitulo || "").trim(),
        pergunta_confirmacao: String(configData.turno2.pergunta_confirmacao || "Você tem certeza que não houve nenhum visitante?").trim(),
        subtitulo_confirmacao: String(configData.turno2.subtitulo_confirmacao || "Confirmação de encerramento do dia no Espaço Experiência.").trim(),
        ativo: configData.turno2.ativo !== false
      },
      atualizado_em: dataHoraStr,
      atualizado_por: autorNome || "André Gianotti"
    };

    PropertiesService.getScriptProperties().setProperty("CONFIG_LEMBRETES", JSON.stringify(safeConfig));

    // Auditoria
    try {
      var ss = getSpreadsheet();
      var sheetAudit = ss.getSheetByName("Logs_Auditoria") || ss.getSheetByName("LogsAuditoria") || ss.getSheetByName("Logs");
      if (sheetAudit) {
        var id = "aud-" + agora.getTime();
        var dataStr = Utilities.formatDate(agora, "America/Sao_Paulo", "dd/MM/yyyy");
        var horaStr = Utilities.formatDate(agora, "America/Sao_Paulo", "HH:mm:ss");
        var acao = "Configuração de Lembretes Diários";
        var detalhes = "Horários configurados: T1 (" + safeConfig.turno1.horario + ") | T2 (" + safeConfig.turno2.horario + ") por " + (autorNome || "André Gianotti");
        sheetAudit.appendRow([id, autorNome || "André Gianotti", emailLimpo, "adm", "configuracoes", "Lembretes Diários", acao, dataStr, horaStr, agora.getTime(), detalhes]);
      }
    } catch(errAudit) {}

    return {
      success: true,
      message: "Configuração dos lembretes diários salva com sucesso!",
      config: safeConfig
    };
  } catch (e) {
    return { success: false, message: e.message };
  }
}
