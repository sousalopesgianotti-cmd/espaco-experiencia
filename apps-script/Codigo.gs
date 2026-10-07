/**
 * ============================================================================
 * TOTVS ESPAÇO EXPERIÊNCIA - GOOGLE APPS SCRIPT BACKEND
 * ============================================================================
 * Governança e Nuvem TOTVS (Google Workspace)
 * 
 * INSTRUÇÃO:
 * Cole o ID da sua Planilha Google corporativa na variável SPREADSHEET_ID abaixo.
 * Exemplo: se a URL for:
 * https://docs.google.com/spreadsheets/d/1A2B3C4D5E6F7G8H9I/edit
 * Então SPREADSHEET_ID = "1A2B3C4D5E6F7G8H9I";
 * ============================================================================
 */

var SPREADSHEET_ID = "COLE_O_ID_DA_SUA_PLANILHA_AQUI";

/**
 * Ponto de entrada HTTP do Web App
 */
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('TOTVS - Espaço Experiência')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1');
}

/**
 * Conexão com a Planilha Google (ou criação 100% automática no Drive da TOTVS!)
 */
function getSpreadsheet() {
  // 1. Se foi salva previamente nas propriedades do projeto
  var propId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (propId && propId.trim() !== "") {
    try { return SpreadsheetApp.openById(propId.trim()); } catch (e) {}
  }

  // 2. Se você colou o ID manualmente na linha 15
  if (SPREADSHEET_ID && SPREADSHEET_ID !== "COLE_O_ID_DA_SUA_PLANILHA_AQUI" && SPREADSHEET_ID.trim() !== "") {
    try { return SpreadsheetApp.openById(SPREADSHEET_ID.trim()); } catch (e) {}
  }

  // 3. Se não tiver ID nenhum: cria a planilha automaticamente no seu Google Drive da TOTVS!
  var novaPlanilha = SpreadsheetApp.create("TOTVS Espaço Experiência - Banco de Dados");
  var novoId = novaPlanilha.getId();
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", novoId);
  Logger.log("Planilha criada automaticamente no seu Google Drive!");
  Logger.log("ID: " + novoId);
  Logger.log("Link: " + novaPlanilha.getUrl());
  return novaPlanilha;
}

/**
 * Função utilitária para consultar o link e ID da sua planilha criada
 */
function verLinkDaMinhaPlanilha() {
  var ss = getSpreadsheet();
  var msg = "Sua planilha está pronta!\nLink: " + ss.getUrl() + "\nID: " + ss.getId();
  Logger.log(msg);
  return msg;
}

/**
 * Captura dados do usuário corporativo TOTVS autenticado
 */
function obterUsuarioAtivo() {
  var email = "";
  try {
    email = Session.getActiveUser().getEmail();
  } catch (e) {}
  
  if (!email || email === "") {
    email = "andre.gianotti@totvs.com.br";
  }
  
  var emailLower = email.toLowerCase().trim();
  var isDono = emailLower === "andre.gianotti@totvs.com.br";
  
  var parteNome = email.split('@')[0].replace(/[._-]/g, ' ');
  var nomeFormatado = parteNome.split(' ').map(function(palavra) {
    return palavra.charAt(0).toUpperCase() + palavra.slice(1).toLowerCase();
  }).join(' ');

  return {
    email: email,
    nome: isDono ? "André Gianotti" : (nomeFormatado || "Especialista TOTVS"),
    cargo: isDono ? "Dono do Produto" : "Colaborador TOTVS",
    tipo: "administrador",
    dono_produto: isDono,
    foto: ""
  };
}

/**
 * Carga inicial consolidada de todos os dados do showroom
 */
function obterDadosIniciais() {
  try {
    var ss = getSpreadsheet();
    var usuario = obterUsuarioAtivo();
    
    var segmentos = carregarSegmentos(ss);
    var plantonistas = carregarPlantonistas(ss);
    var videoGestao = carregarVideoGestao(ss);
    var visitantes = carregarVisitantes(ss);
    var metricas = calcularMetricasVisitantes(visitantes);
    
    return {
      success: true,
      usuario: usuario,
      segmentos: segmentos,
      plantonistas: plantonistas,
      videoGestao: videoGestao,
      visitantes: visitantes,
      metricas: metricas
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      usuario: obterUsuarioAtivo(),
      segmentos: [],
      plantonistas: { especialistas: [], escalas: {} },
      videoGestao: {
        ativo: true,
        tipo: "link",
        url: "https://drive.google.com/file/d/1VOUtlK5WR5rn6T0LwbAffw3K-GWUDK3M/view?usp=sharing",
        titulo: "Video discurso",
        mensagem: "Veja seu discurso aqui !!!",
        subtitulo: "Mensagem institucional da liderança aos visitantes do Espaço Experiência"
      },
      visitantes: [],
      metricas: { hoje: 0, semana: 0, mes: 0, ano: 0, total: 0 }
    };
  }
}

function carregarSegmentos(ss) {
  var aba = ss.getSheetByName("Segmentos");
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  var lista = [];
  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    if (!row[0]) continue;
    try {
      var jsonStr = row[7];
      if (jsonStr && typeof jsonStr === 'string' && jsonStr.startsWith('{')) {
        lista.push(JSON.parse(jsonStr));
      } else {
        lista.push({
          id: String(row[0]),
          ordem: Number(row[1]) || i,
          nome: String(row[2]),
          tagline: String(row[3] || ""),
          pitch: String(row[4] || ""),
          foto_bancada: String(row[5] || ""),
          icone: String(row[6] || "Factory"),
          credenciais: { ip: "", usuario: "", senha: "", porta: "" },
          badge_solucoes: []
        });
      }
    } catch (e) {
      lista.push({ id: String(row[0]), ordem: Number(row[1]) || i, nome: String(row[2]) });
    }
  }
  return lista.sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0); });
}

function carregarPlantonistas(ss) {
  var aba = ss.getSheetByName("Plantonistas");
  if (!aba) return { especialistas: [], escalas: {} };
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return { especialistas: [], escalas: {} };

  var especialistas = [];
  var escalas = {};

  for (var i = 1; i < dados.length; i++) {
    var row = dados[i];
    var tipo = String(row[0]);
    if (tipo === "ESPECIALISTA") {
      especialistas.push({
        id: String(row[1]),
        nome: String(row[2]),
        cargo: String(row[3]),
        email: String(row[4]),
        ramal: String(row[5]),
        avatar_cor: String(row[6]) || "bg-totvs-blue",
        estacao_foco: String(row[7]) || ""
      });
    } else if (tipo === "ESCALA") {
      var dataStr = String(row[1]);
      if (dataStr) {
        escalas[dataStr] = {
          especialista_id: String(row[2]),
          nome: String(row[3]),
          turno: String(row[4]) || "09:00 - 18:00",
          observacoes: String(row[5]) || ""
        };
      }
    }
  }

  return { especialistas: especialistas, escalas: escalas };
}

function carregarVideoGestao(ss) {
  var aba = ss.getSheetByName("VideoGestao");
  var defaultVideo = {
    ativo: true,
    tipo: "link",
    url: "https://drive.google.com/file/d/1VOUtlK5WR5rn6T0LwbAffw3K-GWUDK3M/view?usp=sharing",
    titulo: "Video discurso",
    mensagem: "Veja seu discurso aqui !!!",
    subtitulo: "Mensagem institucional da liderança aos visitantes do Espaço Experiência",
    atualizado_em: "06/10/2026, 17:20:00",
    atualizado_por: "Administrador"
  };
  if (!aba) return defaultVideo;
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return defaultVideo;

  return {
    ativo: dados[1][0] === true || String(dados[1][0]).toLowerCase() === "true",
    tipo: String(dados[1][1] || "link"),
    url: String(dados[1][2] || defaultVideo.url),
    titulo: String(dados[1][3] || defaultVideo.titulo),
    mensagem: String(dados[1][4] || defaultVideo.mensagem),
    subtitulo: String(dados[1][5] || defaultVideo.subtitulo),
    atualizado_em: String(dados[1][6] || ""),
    atualizado_por: String(dados[1][7] || "Administrador")
  };
}

function carregarVisitantes(ss) {
  var aba = ss.getSheetByName("Visitantes");
  if (!aba) return [];
  var dados = aba.getDataRange().getValues();
  if (dados.length <= 1) return [];

  var lista = [];
  for (var i = 1; i < dados.length; i++) {
    var r = dados[i];
    if (!r[0]) continue;
    
    var dataFormatada = r[1];
    if (dataFormatada instanceof Date) {
      var y = dataFormatada.getFullYear();
      var m = String(dataFormatada.getMonth() + 1);
      var d = String(dataFormatada.getDate());
      dataFormatada = y + "-" + (m.length === 1 ? "0" + m : m) + "-" + (d.length === 1 ? "0" + d : d);
    } else {
      dataFormatada = String(dataFormatada);
    }

    lista.push({
      id: String(r[0]),
      data: dataFormatada,
      empresa: String(r[2]),
      nome: String(r[2]),
      tipo_visitante: String(r[3] || "cliente").toLowerCase(),
      numero_pessoas: Number(r[4]) || 1,
      responsavel: String(r[5]),
      criado_em: String(r[6] || ""),
      timestamp: Number(r[7]) || (new Date().getTime())
    });
  }
  return lista;
}

function calcularMetricasVisitantes(visitantes) {
  var agora = new Date();
  var anoAtual = agora.getFullYear();
  var mesAtual = agora.getMonth() + 1;
  var diaAtual = agora.getDate();
  
  var pad = function(n) { return (n < 10 ? '0' : '') + n; };
  var hojeStr = anoAtual + '-' + pad(mesAtual) + '-' + pad(diaAtual);
  var mesPrefix = anoAtual + '-' + pad(mesAtual);
  var anoPrefix = String(anoAtual);

  var dayOfWeek = agora.getDay();
  var diffMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  var diffFriday = dayOfWeek === 0 ? -2 : 5 - dayOfWeek;
  
  var monday = new Date(agora);
  monday.setDate(agora.getDate() + diffMonday);
  var friday = new Date(agora);
  friday.setDate(agora.getDate() + diffFriday);
  
  var weekMonday = monday.getFullYear() + '-' + pad(monday.getMonth() + 1) + '-' + pad(monday.getDate());
  var weekFriday = friday.getFullYear() + '-' + pad(friday.getMonth() + 1) + '-' + pad(friday.getDate());

  var hoje = 0, semana = 0, mes = 0, ano = 0, total = 0;

  for (var i = 0; i < visitantes.length; i++) {
    var v = visitantes[i];
    var qtd = Number(v.numero_pessoas) || 1;
    total += qtd;
    var d = String(v.data).slice(0, 10);

    if (d === hojeStr) hoje += qtd;
    if (d >= weekMonday && d <= weekFriday) semana += qtd;
    if (d.indexOf(mesPrefix) === 0) mes += qtd;
    if (d.indexOf(anoPrefix) === 0) ano += qtd;
  }

  return {
    hoje: hoje,
    semana: semana,
    mes: mes,
    ano: ano,
    ano_atual: anoAtual,
    total: total
  };
}

/**
 * Salva um novo visitante presencial na planilha Google
 */
function salvarVisitante(dados) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Visitantes");
    if (!aba) throw new Error("Aba 'Visitantes' não encontrada na planilha.");

    var id = "vis-" + new Date().getTime() + "-" + Math.random().toString(36).substring(2, 6);
    var dataVisita = String(dados.data || "").trim();
    var empresa = String(dados.empresa || dados.nome || "").trim();
    var tipoVisitante = String(dados.tipo_visitante || "cliente").trim().toLowerCase();
    var numeroPessoas = Number(dados.numero_pessoas) || 1;
    var responsavel = String(dados.responsavel || "").trim();
    var criadoEm = new Date().toLocaleString("pt-BR");
    var timestamp = new Date().getTime();

    aba.appendRow([id, dataVisita, empresa, tipoVisitante, numeroPessoas, responsavel, criadoEm, timestamp]);

    var visitantes = carregarVisitantes(ss);
    var metricas = calcularMetricasVisitantes(visitantes);

    return {
      success: true,
      message: "Visita registrada com sucesso na planilha TOTVS!",
      metricas: metricas,
      visitante: {
        id: id,
        data: dataVisita,
        empresa: empresa,
        tipo_visitante: tipoVisitante,
        numero_pessoas: numeroPessoas,
        responsavel: responsavel,
        criado_em: criadoEm
      }
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Salva a alteração de escala no calendário de plantonistas
 */
function salvarEscalaPlantonista(dataStr, espId) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Plantonistas");
    if (!aba) throw new Error("Aba 'Plantonistas' não encontrada.");

    var dados = aba.getDataRange().getValues();
    var linhaExistente = -1;
    var nomeEsp = "";

    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === "ESPECIALISTA" && String(dados[i][1]) === espId) {
        nomeEsp = String(dados[i][2]);
        break;
      }
    }

    for (var j = 1; j < dados.length; j++) {
      if (String(dados[j][0]) === "ESCALA" && String(dados[j][1]) === dataStr) {
        linhaExistente = j + 1;
        break;
      }
    }

    if (linhaExistente > 0) {
      aba.getRange(linhaExistente, 3).setValue(espId);
      aba.getRange(linhaExistente, 4).setValue(nomeEsp);
      aba.getRange(linhaExistente, 5).setValue("09:00 - 18:00");
    } else {
      aba.appendRow(["ESCALA", dataStr, espId, nomeEsp, "09:00 - 18:00", "Plantão Presencial", "", ""]);
    }

    return { success: true, plantonistas: carregarPlantonistas(ss) };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Salva alterações de uma estação (pitch, foto, credenciais)
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

    var jsonStr = JSON.stringify(seg);

    if (linha > 0) {
      aba.getRange(linha, 2).setValue(seg.ordem);
      aba.getRange(linha, 3).setValue(seg.nome);
      aba.getRange(linha, 4).setValue(seg.tagline || "");
      aba.getRange(linha, 5).setValue(seg.pitch || "");
      aba.getRange(linha, 6).setValue(seg.foto_bancada || "");
      aba.getRange(linha, 7).setValue(seg.icone || "Factory");
      aba.getRange(linha, 8).setValue(jsonStr);
    } else {
      aba.appendRow([seg.id, seg.ordem, seg.nome, seg.tagline || "", seg.pitch || "", seg.foto_bancada || "", seg.icone || "Factory", jsonStr]);
    }

    return { success: true, segmentos: carregarSegmentos(ss) };
  } catch (err) {
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
    if (!aba) throw new Error("Aba 'VideoGestao' não encontrada.");

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
function inicializarPlanilha() {
  var ss = getSpreadsheet();
  
  // 1. Aba Segmentos
  var abaSeg = ss.getSheetByName("Segmentos");
  if (!abaSeg) abaSeg = ss.insertSheet("Segmentos");
  abaSeg.clear();
  abaSeg.appendRow(["ID", "Ordem", "Nome", "Tagline", "Pitch", "Foto Bancada", "Icone", "DadosCompletosJSON"]);
  abaSeg.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
  
  try {
    var resSeg = UrlFetchApp.fetch("https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/data/segmentos.json");
    var listaSeg = JSON.parse(resSeg.getContentText());
    for (var i = 0; i < listaSeg.length; i++) {
      var s = listaSeg[i];
      abaSeg.appendRow([s.id, s.ordem, s.nome, s.tagline || "", s.pitch || "", s.foto_bancada || "", s.icone || "Factory", JSON.stringify(s)]);
    }
  } catch(e) {}

  // 2. Aba Plantonistas
  var abaPlan = ss.getSheetByName("Plantonistas");
  if (!abaPlan) abaPlan = ss.insertSheet("Plantonistas");
  abaPlan.clear();
  abaPlan.appendRow(["RegistroTipo", "ChaveOuData", "NomeOuIdEsp", "CargoOuNomeEsp", "EmailOuTurno", "RamalOuObs", "AvatarCor", "EstacaoFoco"]);
  abaPlan.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");

  try {
    var resPlan = UrlFetchApp.fetch("https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/data/plantonistas.json");
    var dadosPlan = JSON.parse(resPlan.getContentText());
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
  } catch(e) {}

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
