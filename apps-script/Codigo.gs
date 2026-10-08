
/**
 * ============================================================================
 * AUTENTICAÇÃO E GOVERNANÇA DE ADMINISTRADORES NA NUVEM TOTVS
 * ============================================================================
 */
function autenticarUsuario(email, senha) {
  var emailLimpo = String(email || "").toLowerCase().trim();
  var senhaLimpa = String(senha || "").trim();

  // 1. Dono do Produto Oficial (André Gianotti)
  if (emailLimpo === "andre.gianotti@totvs.com.br" && (senhaLimpa === "totvs123" || senhaLimpa === "123")) {
    var usuarioDono = {
      id: "adm-001",
      email: "andre.gianotti@totvs.com.br",
      nome: "André Gianotti",
      cargo: "Dono do Produto",
      tipo: "administrador",
      dono_produto: true,
      precisa_trocar_senha: false,
      foto: ""
    };
    registrarLogAcesso(usuarioDono.nome, "Login efetuado com sucesso (Dono do Produto)");
    return { success: true, usuario: usuarioDono };
  }

  // 2. Consulta à aba "Usuarios" da Planilha Google corporativa (se existir)
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (aba) {
      var dados = aba.getDataRange().getValues();
      for (var i = 1; i < dados.length; i++) {
        var row = dados[i];
        if (String(row[1]).toLowerCase().trim() === emailLimpo && String(row[4]).trim() === senhaLimpa) {
          var u = {
            id: String(row[0]),
            email: String(row[1]),
            nome: String(row[2]),
            cargo: String(row[3] || "Administrador"),
            tipo: "administrador",
            dono_produto: String(row[5]) === "true",
            precisa_trocar_senha: String(row[6]) === "true",
            foto: String(row[7] || "")
          };
          registrarLogAcesso(u.nome, "Login efetuado com sucesso (Painel ADM)");
          return { success: true, usuario: u };
        }
      }
    }
  } catch(e) {}

  // 3. Fallback corporativo para especialistas com senha padrão
  if (senhaLimpa === "totvs123" || senhaLimpa === "123") {
    var parte = emailLimpo.split('@')[0].replace(/[._-]/g, ' ');
    var nomeFmt = parte.split(' ').map(function(w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
    var uEspec = {
      id: "usr-" + new Date().getTime(),
      email: emailLimpo,
      nome: nomeFmt || "Especialista TOTVS",
      cargo: "Administrador",
      tipo: "administrador",
      dono_produto: false,
      precisa_trocar_senha: false,
      foto: ""
    };
    registrarLogAcesso(uEspec.nome, "Login efetuado com sucesso");
    return { success: true, usuario: uEspec };
  }

  return { success: false, message: "E-mail ou senha incorretos." };
}

function registrarLogAcesso(usuarioNome, acao) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Logs");
    if (aba) {
      var agora = new Date();
      aba.appendRow([
        "log-" + agora.getTime(),
        agora.toLocaleDateString("pt-BR"),
        agora.toLocaleTimeString("pt-BR"),
        usuarioNome || "Usuário",
        acao || "Acesso",
        "Acesso autenticado ao sistema"
      ]);
    }
  } catch(e) {}
}

function carregarUsuarios(ss) {
  var usuarios = [
    {
      id: "adm-001",
      email: "andre.gianotti@totvs.com.br",
      nome: "André Gianotti",
      cargo: "Dono do Produto",
      dono_produto: true,
      tipo: "administrador",
      ativo: true,
      foto: "",
      criado_em: "16/09/2026 15:30"
    }
  ];
  try {
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return usuarios;
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return usuarios;
    for (var i = 1; i < dados.length; i++) {
      var r = dados[i];
      if (!r[0]) continue;
      if (String(r[1]).toLowerCase().trim() === "andre.gianotti@totvs.com.br") continue;
      usuarios.push({
        id: String(r[0]),
        email: String(r[1]),
        nome: String(r[2]),
        cargo: String(r[3] || "Administrador"),
        dono_produto: String(r[5]) === "true",
        tipo: "administrador",
        ativo: true,
        foto: String(r[7] || ""),
        criado_em: String(r[8] || "")
      });
    }
  } catch(e) {}
  return usuarios;
}

function obterDadosAdmin() {
  try {
    var ss = getSpreadsheet();
    var usuarios = carregarUsuarios(ss);
    var convites = carregarConvites(ss);
    var visitantes = carregarVisitantes(ss);
    var metricas = calcularMetricasVisitantes(visitantes);
    var logsAcesso = carregarLogsAcesso(ss);
    var logsAuditoria = carregarLogsAuditoria(ss);

    return {
      success: true,
      usuarios: usuarios,
      convites: convites,
      metricas: metricas,
      logsAcesso: logsAcesso,
      logsAuditoria: logsAuditoria
    };
  } catch(e) {
    return {
      success: true,
      usuarios: [
        {
          id: "adm-001",
          email: "andre.gianotti@totvs.com.br",
          nome: "André Gianotti",
          cargo: "Dono do Produto",
          dono_produto: true,
          tipo: "administrador",
          ativo: true,
          foto: "",
          criado_em: "16/09/2026 15:30"
        }
      ],
      convites: [],
      metricas: { hoje: 0, semana: 0, mes: 0, ano: 0, total: 0 },
      logsAcesso: [],
      logsAuditoria: []
    };
  }
}

function carregarConvites(ss) {
  try {
    var aba = ss.getSheetByName("Convites");
    if (!aba) return [];
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return [];
    var lista = [];
    for (var i = 1; i < dados.length; i++) {
      var r = dados[i];
      if (!r[0]) continue;
      lista.push({
        id: String(r[0]),
        token: String(r[1]),
        email: String(r[2]),
        nome: String(r[3] || ""),
        criado_por: String(r[4] || "André Gianotti"),
        criado_em: String(r[5] || ""),
        utilizado: String(r[6]) === "true"
      });
    }
    return lista;
  } catch(e) {
    return [];
  }
}

function salvarConviteAdmin(dados) {
  try {
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Convites");
    if (!aba) {
      aba = ss.insertSheet("Convites");
      aba.appendRow(["ID", "Token", "Email", "Nome", "CriadoPor", "CriadoEm", "Utilizado"]);
      aba.getRange("A1:G1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
    }
    var token = "adm_" + Math.random().toString(36).substring(2, 10) + new Date().getTime().toString(36);
    var id = "conv-" + new Date().getTime();
    var agora = new Date().toLocaleString("pt-BR");
    var convite = {
      id: id,
      token: token,
      email: dados.email,
      nome: dados.nome,
      criado_por: dados.criado_por || "André Gianotti",
      criado_em: agora,
      utilizado: false
    };
    aba.appendRow([convite.id, convite.token, convite.email, convite.nome, convite.criado_por, convite.criado_em, false]);
    return { success: true, convite: convite };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function removerUsuarioAdmin(id) {
  try {
    if (id === "adm-001" || id === "usr-dono") {
      return { success: false, message: "O Dono do Produto não pode ser removido!" };
    }
    var ss = getSpreadsheet();
    var aba = ss.getSheetByName("Usuarios");
    if (!aba) return { success: true };
    var dados = aba.getDataRange().getValues();
    for (var i = 1; i < dados.length; i++) {
      if (String(dados[i][0]) === String(id)) {
        aba.deleteRow(i + 1);
        break;
      }
    }
    return { success: true, usuarios: carregarUsuarios(ss) };
  } catch(e) {
    return { success: false, error: e.message };
  }
}

function carregarLogsAcesso(ss) {
  try {
    var aba = ss.getSheetByName("Logs");
    if (!aba) return [];
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return [];
    var lista = [];
    for (var i = dados.length - 1; i >= 1 && lista.length < 50; i--) {
      var r = dados[i];
      if (!r[0]) continue;
      lista.push({
        id: String(r[0]),
        data: String(r[1]),
        hora: String(r[2]),
        usuario: String(r[3]),
        acao: String(r[4]),
        detalhes: String(r[5] || "")
      });
    }
    return lista;
  } catch(e) {
    return [];
  }
}

function carregarLogsAuditoria(ss) {
  return carregarLogsAcesso(ss);
}

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
  var template = HtmlService.createTemplateFromFile('Index');
  var conviteParam = (e && e.parameter && e.parameter.convite) ? String(e.parameter.convite).trim() : "";
  var webAppUrl = "";
  try {
    webAppUrl = ScriptApp.getService().getUrl();
  } catch(err) {}
  
  if (!webAppUrl || webAppUrl === "") {
    webAppUrl = "https://script.google.com/a/macros/totvs.com.br/s/AKfycbw1MxTh0_1-PMbw-GqL7vsBVA6IzLA_4HkYv5BdxcGIaA70MKZK5UuFwAouIFS3bVrq/exec";
  }

  template.CONVITE_PARAM = conviteParam;
  template.WEB_APP_URL = webAppUrl;

  return template.evaluate()
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
      segmentos: getSegmentosPadrao(),
      plantonistas: getPlantonistasPadrao(),
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
  try {
    var aba = ss.getSheetByName("Segmentos");
    if (!aba || aba.getLastRow() <= 1) {
      inicializarPlanilha(ss);
      aba = ss.getSheetByName("Segmentos");
    }
    if (!aba) return getSegmentosPadrao();
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return getSegmentosPadrao();

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
    return (lista.length > 0) ? lista.sort(function(a, b) { return (a.ordem || 0) - (b.ordem || 0); }) : getSegmentosPadrao();
  } catch (err) {
    Logger.log("Aviso ao ler segmentos: " + err.message);
    return getSegmentosPadrao();
  }
}

function carregarPlantonistas(ss) {
  try {
    var aba = ss.getSheetByName("Plantonistas");
    if (!aba || aba.getLastRow() <= 1) {
      inicializarPlanilha(ss);
      aba = ss.getSheetByName("Plantonistas");
    }
    if (!aba) return getPlantonistasPadrao();
    var dados = aba.getDataRange().getValues();
    if (dados.length <= 1) return getPlantonistasPadrao();

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
  } catch (err) {
    return getPlantonistasPadrao();
  }
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
function inicializarPlanilha(ss) {
  if (!ss) ss = getSpreadsheet();
  
  // 1. Aba Segmentos
  var abaSeg = ss.getSheetByName("Segmentos");
  if (!abaSeg) abaSeg = ss.insertSheet("Segmentos");
  abaSeg.clear();
  abaSeg.appendRow(["ID", "Ordem", "Nome", "Tagline", "Pitch", "Foto Bancada", "Icone", "DadosCompletosJSON"]);
  abaSeg.getRange("A1:H1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
  
  var listaSeg = getSegmentosPadrao();
  try {
    var resSeg = UrlFetchApp.fetch("https://raw.githubusercontent.com/sousalopesgianotti-cmd/espaco-experiencia/main/data/segmentos.json");
    var parsedSeg = JSON.parse(resSeg.getContentText());
    if (parsedSeg && parsedSeg.length > 0) listaSeg = parsedSeg;
  } catch(e) {}

  for (var i = 0; i < listaSeg.length; i++) {
    var s = listaSeg[i];
    abaSeg.appendRow([s.id, s.ordem, s.nome, s.tagline || "", s.pitch || "", s.foto_bancada || "", s.icone || "Factory", JSON.stringify(s)]);
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
    "pitch": "No agronegócio, a TOTVS conecta toda a cadeia produtiva, desde o preparo do solo e controle de pragas até a armazenagem em silos e comercialização internacional de grãos e café. Nossas soluções dão ao produtor e à agroindústria previsibilidade de safra, rastreabilidade de ponta a ponta e redução de perdas operacionais.",
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
          "url": "uploads/media_20261005_160250_totvs_agro.mp4"
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
    "foto_bancada": "uploads/media_20261005_105823_esta__o_1_totvs_agro.jpeg"
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
    "foto_bancada": "uploads/media_20261005_105834_esta__o_2_totvs_manufatura.jpeg"
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
    "foto_bancada": "uploads/media_20261005_113005_esta__o_3_backoffice.jpeg"
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
    "foto_bancada": "uploads/media_20261005_113016_esta__o_4_totvs_ppi_multitask_mes.jpeg"
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
    "foto_bancada": "uploads/bancada_totvs_logistica.jpg"
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
          "url": "uploads/media_20261005_160649_totvs_moda.mp4"
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
    "foto_bancada": "uploads/media_20261005_120933_totvs_moda.jpeg"
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
    "foto_bancada": "uploads/media_20261005_120944_totvs_consinco.jpeg"
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
          "url": "uploads/media_20261005_160329_varejo_on_line.mp4"
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
    "foto_bancada": "uploads/media_20261005_120958_totvs_varejo.jpeg"
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
    "foto_bancada": "uploads/media_20261005_121009_totvs_rm_saude.jpeg"
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
    "foto_bancada": "uploads/media_20261005_121049_mesa_interativa.jpeg"
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
    "foto_bancada": ""
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
    }
  ],
  "escalas": {
    "2026-10-01": {
      "especialista_id": "esp-1",
      "nome": "André Gianotti",
      "turno": "09:00 - 18:00",
      "observacoes": "Abertura do Mês & Plantão Geral"
    },
    "2026-10-02": {
      "especialista_id": "esp-2",
      "nome": "Camila Santana",
      "turno": "09:00 - 18:00",
      "observacoes": "Demonstração MES & Linha de Produção"
    },
    "2026-10-05": {
      "especialista_id": "esp-3",
      "nome": "Lucas Ferreira",
      "turno": "09:00 - 18:00",
      "observacoes": "Bancada Agro e Cadeia Logística"
    },
    "2026-10-06": {
      "especialista_id": "esp-4",
      "nome": "Mariana Lima",
      "turno": "09:00 - 18:00",
      "observacoes": "Omnichannel e Totem de Moda"
    },
    "2026-10-07": {
      "especialista_id": "esp-1",
      "nome": "André Gianotti",
      "turno": "09:00 - 18:00",
      "observacoes": "Plantão Geral do Espaço Experiência & Curadoria"
    },
    "2026-10-08": {
      "especialista_id": "esp-2",
      "nome": "Camila Santana",
      "turno": "09:00 - 18:00",
      "observacoes": "Foco Manufatura & MES PPI"
    },
    "2026-10-09": {
      "especialista_id": "esp-3",
      "nome": "Lucas Ferreira",
      "turno": "09:00 - 18:00",
      "observacoes": "Foco Agro, Balança & Distribuição"
    },
    "2026-10-12": {
      "especialista_id": null,
      "nome": "Espaço Fechado",
      "turno": "Feriado",
      "observacoes": "Feriado Nacional (Nossa Senhora Aparecida)"
    },
    "2026-10-13": {
      "especialista_id": "esp-4",
      "nome": "Mariana Lima",
      "turno": "09:00 - 18:00",
      "observacoes": "Varejo, Moda & RFID"
    },
    "2026-10-14": {
      "especialista_id": "esp-5",
      "nome": "Rafael Duarte",
      "turno": "09:00 - 18:00",
      "observacoes": "Saúde, Clínicas & Prontuário Eletrônico"
    },
    "2026-10-15": {
      "especialista_id": "esp-1",
      "nome": "André Gianotti",
      "turno": "09:00 - 18:00",
      "observacoes": "Visitas Executivas VIP"
    },
    "2026-10-16": {
      "especialista_id": "esp-6",
      "nome": "Fernanda Torres",
      "turno": "09:00 - 18:00",
      "observacoes": "Supermercados Consinco & Checkout"
    },
    "2026-10-19": {
      "especialista_id": "esp-7",
      "nome": "Bruno Carvalho",
      "turno": "09:00 - 18:00",
      "observacoes": "Mesa Interativa & Soluções Cross"
    },
    "2026-10-20": {
      "especialista_id": "esp-2",
      "nome": "Camila Santana",
      "turno": "09:00 - 18:00",
      "observacoes": "Manufatura & Gestão de Fábrica"
    },
    "2026-10-21": {
      "especialista_id": "esp-3",
      "nome": "Lucas Ferreira",
      "turno": "09:00 - 18:00",
      "observacoes": "Rastreabilidade Agro & Logística"
    },
    "2026-10-22": {
      "especialista_id": "esp-4",
      "nome": "Mariana Lima",
      "turno": "09:00 - 18:00",
      "observacoes": "Live Commerce & E-commerce"
    },
    "2026-10-23": {
      "especialista_id": "esp-5",
      "nome": "Rafael Duarte",
      "turno": "09:00 - 18:00",
      "observacoes": "Backoffice, ERP & Inteligência Fiscal"
    },
    "2026-10-26": {
      "especialista_id": "esp-1",
      "nome": "André Gianotti",
      "turno": "09:00 - 18:00",
      "observacoes": "Plantão e Coordenação Semanal"
    },
    "2026-10-27": {
      "especialista_id": "esp-6",
      "nome": "Fernanda Torres",
      "turno": "09:00 - 18:00",
      "observacoes": "Distribuição e Varejo Supermercadista"
    },
    "2026-10-28": {
      "especialista_id": "esp-7",
      "nome": "Bruno Carvalho",
      "turno": "09:00 - 18:00",
      "observacoes": "Demonstração na Mesa Interativa"
    },
    "2026-10-29": {
      "especialista_id": "esp-2",
      "nome": "Camila Santana",
      "turno": "09:00 - 18:00",
      "observacoes": "Manufatura e Eficiência Operacional"
    },
    "2026-10-30": {
      "especialista_id": "esp-3",
      "nome": "Lucas Ferreira",
      "turno": "09:00 - 18:00",
      "observacoes": "Fechamento Mensal Agro & Operações"
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
          return {
            success: true,
            convite: {
              id: String(r[0]),
              token: String(r[1]),
              email: String(r[2]),
              nome: String(r[3]),
              criado_por: String(r[4] || "André Gianotti"),
              criado_em: String(r[5] || ""),
              utilizado: false
            }
          };
        }
      }
    }
  } catch(e) {}

  // Fallback caso seja um token com prefixo padrão
  if (tokenLimpo.startsWith("adm_")) {
    return {
      success: true,
      convite: {
        id: "conv-" + new Date().getTime(),
        token: tokenLimpo,
        email: "",
        nome: "Novo Administrador",
        criado_por: "André Gianotti",
        criado_em: new Date().toLocaleString("pt-BR"),
        utilizado: false
      }
    };
  }

  return { success: false, message: "Convite inválido ou expirado." };
}

function aceitarConvite(dados) {
  var token = String(dados.token || "").trim();
  var nome = String(dados.nome || "").trim();
  var email = String(dados.email || "").toLowerCase().trim();
  var senhaProvisoria = String(dados.senhaProvisoria || "").trim();
  var novaSenha = String(dados.novaSenha || "").trim();

  if (senhaProvisoria !== "123") {
    return { success: false, message: "A senha provisória padrão é 123. Verifique e tente novamente." };
  }

  if (novaSenha.length < 6) {
    return { success: false, message: "A nova senha deve ter no mínimo 6 caracteres." };
  }

  var temLetra = /[a-zA-Z]/.test(novaSenha);
  var temNumero = /[0-9]/.test(novaSenha);
  if (!temLetra || !temNumero) {
    return { success: false, message: "A nova senha deve conter letras e números (alfanumérica)." };
  }

  var idNovo = "adm-" + new Date().getTime();
  var agora = new Date().toLocaleString("pt-BR");
  var novoUsuario = {
    id: idNovo,
    nome: nome,
    email: email,
    cargo: "Administrador",
    tipo: "administrador",
    dono_produto: false,
    precisa_trocar_senha: false,
    foto: "",
    criado_em: agora
  };

  try {
    var ss = getSpreadsheet();
    
    // 1. Marcar convite como utilizado
    var abaConv = ss.getSheetByName("Convites");
    if (abaConv) {
      var dConv = abaConv.getDataRange().getValues();
      for (var i = 1; i < dConv.length; i++) {
        if (String(dConv[i][1]).trim() === token) {
          abaConv.getRange(i + 1, 7).setValue(true);
          break;
        }
      }
    }

    // 2. Inserir novo usuário na aba Usuarios
    var abaUser = ss.getSheetByName("Usuarios");
    if (!abaUser) {
      abaUser = ss.insertSheet("Usuarios");
      abaUser.appendRow(["ID", "Email", "Nome", "Cargo", "Senha", "DonoProduto", "PrecisaTrocarSenha", "Foto", "CriadoEm"]);
      abaUser.getRange("A1:I1").setFontWeight("bold").setBackground("#002554").setFontColor("#FFFFFF");
      abaUser.appendRow(["adm-001", "andre.gianotti@totvs.com.br", "André Gianotti", "Dono do Produto", "totvs123", true, false, "", "16/09/2026"]);
    }
    abaUser.appendRow([idNovo, email, nome, "Administrador", novaSenha, false, false, "", agora]);

    // 3. Registrar log de auditoria
    registrarLogAcesso(nome, "Convite ativado com sucesso. Novo administrador registrado.");

  } catch(e) {}

  return {
    success: true,
    message: "Perfil ativado com sucesso!",
    usuario: novoUsuario
  };
}
