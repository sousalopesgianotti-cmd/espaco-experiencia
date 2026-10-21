const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;
const DATA_DIR = path.join(BASE_DIR, 'data');
const UPLOADS_DIR = path.join(BASE_DIR, 'uploads');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf'
};

function readJsonFile(filePath, defaultVal = []) {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '').trim();
      if (!raw) return defaultVal;
      const parsed = JSON.parse(raw);
      if (Array.isArray(defaultVal) && !Array.isArray(parsed)) {
        return [parsed];
      }
      return parsed;
    }
  } catch (err) {
    console.error(`Error reading ${filePath}:`, err.message);
  }
  return defaultVal;
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error(`Error writing ${filePath}:`, err.message);
    return false;
  }
}

function sendJson(res, data, statusCode = 200) {
  const jsonStr = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
    'Content-Length': Buffer.byteLength(jsonStr)
  });
  res.end(jsonStr);
}

function readBodyJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function getBrasiliaDateInfo(d = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const todayStr = formatter.format(d); // "YYYY-MM-DD"
  const [y, m, day] = todayStr.split('-').map(Number);

  // Formatar dia da semana em Brasília (0 = Domingo, 1 = Segunda, ..., 6 = Sábado)
  const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short'
  });
  const weekdayShort = dayOfWeekFormatter.format(d);
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const dayOfWeek = weekdayMap[weekdayShort] !== undefined ? weekdayMap[weekdayShort] : d.getDay();

  // Janela da semana útil: Segunda a Sexta-feira
  // No fim de semana (Sábado ou Domingo), mantém visível a semana útil recém-concluída
  const dt = new Date(Date.UTC(y, m - 1, day, 12, 0, 0));
  let monOffset, friOffset;
  if (dayOfWeek >= 1 && dayOfWeek <= 5) {
    monOffset = -(dayOfWeek - 1);
    friOffset = 5 - dayOfWeek;
  } else if (dayOfWeek === 6) { // Sábado
    monOffset = -5;
    friOffset = -1;
  } else { // Domingo (0)
    monOffset = -6;
    friOffset = -2;
  }

  const mon = new Date(dt.getTime() + monOffset * 86400000);
  const fri = new Date(dt.getTime() + friOffset * 86400000);
  const fmt = date => date.toISOString().slice(0, 10);

  return {
    todayStr,
    year: y,
    month: m,
    day,
    dayOfWeek,
    weekMonday: fmt(mon),
    weekFriday: fmt(fri),
    monthPrefix: `${y}-${String(m).padStart(2, '0')}`,
    yearPrefix: `${y}`
  };
}

function getTodayString() {
  return getBrasiliaDateInfo().todayStr;
}

function getFormStatus() {
  const statusFile = path.join(DATA_DIR, 'status_formulario.json');
  const data = readJsonFile(statusFile, {});
  const todayStr = getTodayString();
  const abertoHoje = Boolean(data && data.ultima_data_abertura === todayStr);
  return {
    formulario_aberto_hoje: abertoHoje,
    ultima_data_abertura: data ? data.ultima_data_abertura : null,
    ultimo_horario: data ? data.ultimo_horario : null
  };
}

function setFormOpenedToday() {
  const statusFile = path.join(DATA_DIR, 'status_formulario.json');
  const todayStr = getTodayString();
  const horario = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date());

  const statusData = {
    ultima_data_abertura: todayStr,
    ultimo_horario: horario,
    timestamp: Date.now()
  };
  writeJsonFile(statusFile, statusData);
  return statusData;
}

function calculateVisitorMetrics(visitors) {
  if (!Array.isArray(visitors)) visitors = [];
  const dateInfo = getBrasiliaDateInfo();
  const { todayStr, year, monthPrefix, yearPrefix, weekMonday, weekFriday } = dateInfo;

  let hoje = 0;
  let semana = 0;
  let mes = 0;
  let ano = 0;
  let total = 0;

  for (const v of visitors) {
    if (!v) continue;
    const qtdPessoas = Math.max(1, parseInt(v.numero_pessoas, 10) || 1);
    total += qtdPessoas;

    if (!v.data) continue;
    const vData = String(v.data).slice(0, 10);

    // 1. Contador Dia: renova (zera) a cada dia à meia-noite em Brasília
    if (vData === todayStr) {
      hoje += qtdPessoas;
    }

    // 2. Contador Esta Semana: considera rigorosamente Segunda a Sexta-feira
    if (vData >= weekMonday && vData <= weekFriday) {
      semana += qtdPessoas;
    }

    // 3. Contador Mês: soma total e correta dos volumes do mês civil corrente
    if (vData.startsWith(monthPrefix)) {
      mes += qtdPessoas;
    }

    // 4. Contador Ano: soma total e correta dos volumes do ano corrente
    if (vData.startsWith(yearPrefix)) {
      ano += qtdPessoas;
    }
  }

  const formStatus = getFormStatus();

  return {
    hoje,
    semana,
    mes,
    ano,
    ano_atual: year,
    total,
    formulario_aberto_hoje: formStatus.formulario_aberto_hoje,
    ultimo_horario_formulario: formStatus.ultimo_horario
  };
}

function getVisitorHistory(visitors, targetYear, targetMonth) {
  if (!Array.isArray(visitors)) visitors = [];
  const dateInfo = getBrasiliaDateInfo();
  const currentYear = dateInfo.year;
  const yearToUse = parseInt(targetYear, 10) || currentYear;

  const anosSet = new Set([currentYear]);
  for (const v of visitors) {
    if (v && v.data) {
      const y = parseInt(String(v.data).slice(0, 4), 10);
      if (!isNaN(y) && y >= 2020) anosSet.add(y);
    }
  }
  const anosDisponiveis = Array.from(anosSet).sort((a, b) => b - a);

  const mesesNomes = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];

  const mesesResumo = mesesNomes.map((nome, idx) => ({
    mes: idx + 1,
    nome,
    total_pessoas: 0,
    total_visitas: 0
  }));

  let totalAno = 0;
  let visitasAno = 0;
  const visitantesMesEspecifico = [];
  const visitantesDoAno = [];
  const selectedMonthNum = targetMonth ? parseInt(targetMonth, 10) : null;

  for (const v of visitors) {
    if (!v || !v.data) continue;
    const parts = String(v.data).slice(0, 10).split('-');
    if (parts.length < 3) continue;
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const qtd = Math.max(1, parseInt(v.numero_pessoas, 10) || 1);

    if (y === yearToUse) {
      totalAno += qtd;
      visitasAno += 1;
      visitantesDoAno.push(v);
      if (m >= 1 && m <= 12) {
        mesesResumo[m - 1].total_pessoas += qtd;
        mesesResumo[m - 1].total_visitas += 1;

        if (selectedMonthNum && selectedMonthNum === m) {
          visitantesMesEspecifico.push(v);
        }
      }
    }
  }

  return {
    ano: yearToUse,
    ano_atual: currentYear,
    total_ano: totalAno,
    visitas_ano: visitasAno,
    anos_disponiveis: anosDisponiveis,
    meses: mesesResumo,
    mes_selecionado: selectedMonthNum,
    visitantes_mes: visitantesMesEspecifico,
    visitantes_ano: visitantesDoAno
  };
}

function serveStaticFile(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const totalSize = stats.size;

    // Range requests for video/audio streaming
    const range = req.headers.range;
    if (range && (ext === '.mp4' || ext === '.webm' || ext === '.mov')) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${totalSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.on('error', () => { if (!res.writableEnded) res.end(); });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': totalSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });
      const stream = fs.createReadStream(filePath);
      stream.on('error', () => { if (!res.writableEnded) res.end(); });
      stream.pipe(res);
    }
  });
}

const server = http.createServer(async (req, res) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Filename',
      'Access-Control-Max-Age': '86400'
    });
    return res.end();
  }

  const parsedUrl = url.parse(req.url, true);
  const pathname = decodeURIComponent(parsedUrl.pathname);
  const method = req.method;

  try {
    // 0. GET /api/health ou /health (Healthcheck & Keep-Alive Pinger)
    if ((pathname === '/api/health' || pathname === '/health') && method === 'GET') {
      return sendJson(res, { status: 'ok', service: 'espaco-experiencia', timestamp: Date.now() });
    }

    // 1. GET /api/segmentos
    if (pathname === '/api/segmentos' && method === 'GET') {
      const segs = readJsonFile(path.join(DATA_DIR, 'segmentos.json'), []);
      return sendJson(res, segs);
    }

    // 2. PUT /api/segmentos/:id
    const segMatch = pathname.match(/^\/api\/segmentos\/([^/]+)$/);
    if (segMatch && method === 'PUT') {
      const segId = segMatch[1];
      const body = await readBodyJson(req);
      const segFile = path.join(DATA_DIR, 'segmentos.json');
      let segmentos = readJsonFile(segFile, []);

      let updated = false;
      for (let i = 0; i < segmentos.length; i++) {
        if (segmentos[i].id === segId) {
          segmentos[i] = body.segmento || body;
          updated = true;
          break;
        }
      }
      if (!updated && body.segmento) {
        segmentos.push(body.segmento);
      }
      writeJsonFile(segFile, segmentos);

      // Audit log com identificação explícita de PMM ou Administrador
      if (body.autor) {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        const autorPerfil = String(body.autor.perfil || '').toLowerCase().trim() === 'pmm' ? 'pmm' : 'adm';
        const acaoDesc = autorPerfil === 'pmm'
          ? 'Edição de estação por PMM'
          : (body.acao || 'Edição do card com validação manual');

        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: body.autor.nome || (autorPerfil === 'pmm' ? 'PMM TOTVS' : 'Administrador TOTVS'),
          analista_email: body.autor.email || 'especialista@totvs.com.br',
          perfil: autorPerfil,
          segmento_id: segId,
          segmento_nome: body.segmento?.nome || '',
          acao: acaoDesc,
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: body.detalhes || `Atualização de conteúdo realizada por ${body.autor.nome || (autorPerfil === 'pmm' ? 'PMM' : 'Administrador')}.`
        });
        writeJsonFile(auditFile, logs);
      }

      return sendJson(res, { success: true, message: 'Segmento atualizado com sucesso!' });
    }

    // 3. POST /api/upload
    if (pathname === '/api/upload' && method === 'POST') {
      let filename = req.headers['x-filename'] || parsedUrl.query.filename || `upload_${Date.now()}.bin`;
      filename = decodeURIComponent(filename);
      const ext = path.extname(filename) || '.bin';
      const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_\-]/g, '_').toLowerCase().slice(0, 40) || 'midia';
      const now = new Date();
      const pad = n => String(n).padStart(2, '0');
      const timeStr = `${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      const uniqueFileName = `media_${timeStr}_${baseName}${ext}`;
      const destPath = path.join(UPLOADS_DIR, uniqueFileName);

      const writeStream = fs.createWriteStream(destPath);
      let totalBytes = 0;
      req.on('data', chunk => {
        totalBytes += chunk.length;
        writeStream.write(chunk);
      });
      req.on('end', () => {
        writeStream.end(() => {
          sendJson(res, {
            success: true,
            url: `uploads/${uniqueFileName}`,
            filename: uniqueFileName,
            tamanho_bytes: totalBytes
          });
        });
      });
      req.on('error', (err) => {
        writeStream.destroy();
        sendJson(res, { success: false, message: err.message }, 500);
      });
      return;
    }

    // 4. POST /api/access (Contador silencioso de visitantes)
    if (pathname === '/api/access' && method === 'POST') {
      const accessFile = path.join(DATA_DIR, 'logs_acesso.json');
      let logs = readJsonFile(accessFile, []);
      if (!Array.isArray(logs)) logs = [];
      const now = new Date();
      const novoLog = {
        id: `acc-${Date.now()}`,
        data_formatada: now.toLocaleDateString('pt-BR'),
        horario_formatado: now.toLocaleTimeString('pt-BR'),
        timestamp: Date.now(),
        ip_dispositivo: req.headers['user-agent'] || 'Visitante Institucional',
        acao: 'Visita ao Espaço Experiência'
      };
      logs.unshift(novoLog);
      if (logs.length > 1000) logs = logs.slice(0, 1000);
      writeJsonFile(accessFile, logs);
      return sendJson(res, { success: true, total_visitas: logs.length });
    }

    // 5. POST /api/auth/login (Login de Administrador)
    if (pathname === '/api/auth/login' && method === 'POST') {
      const body = await readBodyJson(req);
      const email = (body.email || '').trim().toLowerCase();
      const senha = (body.senha || '').trim();

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const adm = usuarios.find(u => u.email.toLowerCase().trim() === email && (u.senha === senha || u.pin === senha || ((senha === 'totvs123' || senha === '123') && (!u.senha || u.senha === 'totvs123' || u.senha === '123'))));
      if (!adm) {
        return sendJson(res, { success: false, message: 'E-mail ou senha incorretos.' }, 401);
      }

      // 5.1 Validação de bloqueio de perfil desativado
      if (adm.ativo === false) {
        return sendJson(res, {
          success: false,
          message: 'Acesso temporariamente desativado. Entre em contato com um Administrador do Espaço Experiência TOTVS.'
        }, 403);
      }

      const isDono = adm.dono_produto === true || adm.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br';
      const perfil = adm.perfil || (isDono ? 'adm' : (adm.cargo && adm.cargo.toLowerCase().includes('pmm') ? 'pmm' : (adm.cargo && adm.cargo.toLowerCase().includes('especialista') ? 'especialista' : 'adm')));

      // Registrar evento de login autenticado em logs_acesso.json
      try {
        const accessFile = path.join(DATA_DIR, 'logs_acesso.json');
        let logsAcesso = readJsonFile(accessFile, []);
        if (!Array.isArray(logsAcesso)) logsAcesso = [];
        logsAcesso.unshift({
          id: `acc-${Date.now()}`,
          tipo: perfil === 'especialista' ? 'Login de Especialista' : (perfil === 'pmm' ? 'Login de PMM' : 'Login de Administrador'),
          usuario: adm.nome,
          email: adm.email,
          perfil: perfil,
          ip_dispositivo: req.headers['user-agent'] || 'Navegador Web',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          acao: perfil === 'especialista' ? 'Autenticação de Especialista no Showroom' : (perfil === 'pmm' ? 'Autenticação de PMM no Showroom' : 'Autenticação de Administrador no Painel')
        });
        writeJsonFile(accessFile, logsAcesso);
      } catch (errAcesso) {
        console.warn('Falha ao registrar log de acesso:', errAcesso);
      }

      return sendJson(res, {
        success: true,
        usuario: {
          id: adm.id,
          nome: adm.nome,
          email: adm.email,
          perfil: perfil,
          cargo: adm.cargo || (isDono ? 'Dono do Produto' : (perfil === 'pmm' ? 'PMM (Gestor de Segmento)' : (perfil === 'especialista' ? 'Especialista do Espaço Experiência' : 'Administrador'))),
          dono_produto: isDono,
          foto: adm.foto || '',
          ativo: adm.ativo !== false,
          precisa_trocar_senha: adm.precisa_trocar_senha === true
        }
      });
    }

    // 5.2 GET /api/config/auth-mode (Consulta o status da Chave Mestra do Perfil Especialista)
    if (pathname === '/api/config/auth-mode' && method === 'GET') {
      const configFile = path.join(DATA_DIR, 'config.json');
      const cfg = readJsonFile(configFile, { auth_especialista_obrigatoria: false });
      return sendJson(res, {
        success: true,
        auth_especialista_obrigatoria: cfg.auth_especialista_obrigatoria === true
      });
    }

    // 5.3 POST /api/config/auth-mode (Alternar Chave Mestra - Exclusivo Dono do Produto)
    if (pathname === '/api/config/auth-mode' && method === 'POST') {
      const body = await readBodyJson(req);
      const autorEmail = (body.autorEmail || '').trim().toLowerCase();
      const isDono = autorEmail === 'andre.gianotti@totvs.com.br' || body.dono_produto === true;

      if (!isDono) {
        return sendJson(res, {
          success: false,
          message: 'Ação restrita: Somente o Dono do Produto (andre.gianotti@totvs.com.br) tem autorização para alterar a chave do Perfil Especialista.'
        }, 403);
      }

      const configFile = path.join(DATA_DIR, 'config.json');
      let cfg = readJsonFile(configFile, { auth_especialista_obrigatoria: false });
      const novoModo = body.obrigatoria !== undefined ? (body.obrigatoria === true) : !(cfg.auth_especialista_obrigatoria === true);
      cfg.auth_especialista_obrigatoria = novoModo;
      writeJsonFile(configFile, cfg);

      // Registrar em Auditoria
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: body.autorNome || 'André Gianotti',
          analista_email: autorEmail || 'andre.gianotti@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'governanca',
          segmento_nome: 'Governança do Showroom',
          acao: novoModo ? 'Ativação do Modo Estrito (Login Obrigatório para Especialistas)' : 'Ativação do Modo Aberto (Acesso Especialista Sem Login)',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `A chave mestra do Perfil Especialista foi alterada para ${novoModo ? 'MODO ESTRITO (exige login individual)' : 'MODO ABERTO (usuários deslogados herdam privilégios de especialista)'} pelo Dono do Produto.`
        });
        writeJsonFile(auditFile, logs);
      } catch (eAudit) {
        console.warn('Erro ao registrar auditoria da chave mestra:', eAudit);
      }

      return sendJson(res, {
        success: true,
        message: `Chave do Perfil Especialista alterada para ${novoModo ? 'Modo Estrito (Login Obrigatório)' : 'Modo Aberto (Sem Login Obrigatório)'} com sucesso!`,
        auth_especialista_obrigatoria: novoModo
      });
    }

    // 6. GET /api/admin/metrics (Métricas de Acesso e Totais)
    if (pathname === '/api/admin/metrics' && method === 'GET') {
      const accessFile = path.join(DATA_DIR, 'logs_acesso.json');
      const logs = readJsonFile(accessFile, []);
      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      const usuarios = readJsonFile(usrFile, []);
      const convitesFile = path.join(DATA_DIR, 'convites.json');
      const convites = readJsonFile(convitesFile, []);

      return sendJson(res, {
        success: true,
        total_visitas: Array.isArray(logs) ? logs.length : 0,
        total_adms: Array.isArray(usuarios) ? usuarios.length : 1,
        total_convites: Array.isArray(convites) ? convites.length : 0,
        ultimo_acesso: Array.isArray(logs) && logs.length > 0 ? logs[0] : null
      });
    }

    // 7. POST /api/admin/invite (Gerar Link de Convite com Pré-cadastro de Nome e E-mail)
    if (pathname === '/api/admin/invite' && method === 'POST') {
      const body = await readBodyJson(req);
      const nome = (body.nome || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const criadoPor = body.criado_por || 'Administrador';

      if (!nome || nome.length < 3) {
        return sendJson(res, { success: false, message: 'O nome completo do novo administrador é obrigatório (mínimo 3 letras).' }, 400);
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!email || !emailRegex.test(email)) {
        return sendJson(res, { success: false, message: 'Informe um endereço de e-mail corporativo válido (exemplo: usuario@totvs.com.br).' }, 400);
      }

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      const usuarios = readJsonFile(usrFile, []);
      if (Array.isArray(usuarios) && usuarios.some(u => u.email.toLowerCase().trim() === email)) {
        return sendJson(res, { success: false, message: 'Já existe um administrador cadastrado com este e-mail no sistema.' }, 400);
      }

      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      // Se já existe convite pendente para este email, reutilizar
      const existingUnused = convites.find(c => c.email && c.email.toLowerCase().trim() === email && !c.utilizado);
      if (existingUnused) {
        return sendJson(res, {
          success: true,
          token: existingUnused.token,
          convite: existingUnused,
          reused: true
        });
      }

      let perfil = (body.perfil || 'especialista').toLowerCase().trim();
      if (perfil !== 'adm' && perfil !== 'pmm' && perfil !== 'especialista') {
        perfil = 'especialista';
      }
      const prefix = perfil === 'adm' ? 'adm_' : (perfil === 'especialista' ? 'esp_' : 'pmm_');
      const token = prefix + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const novoConvite = {
        id: `conv-${Date.now()}`,
        token,
        nome,
        email,
        perfil,
        cargo: body.cargo || (perfil === 'especialista' ? 'Especialista do Espaço Experiência' : (perfil === 'pmm' ? 'PMM' : 'Administrador')),
        senha_provisoria: 'totvs123',
        criado_por: criadoPor,
        criado_em: new Date().toLocaleString('pt-BR'),
        utilizado: false
      };
      convites.unshift(novoConvite);
      writeJsonFile(convitesFile, convites);

      return sendJson(res, {
        success: true,
        token,
        convite: novoConvite
      });
    }

    // 8. GET /api/admin/invite/:token (Validar Link de Convite)
    const inviteMatch = pathname.match(/^\/api\/admin\/invite\/([^/]+)$/);
    if (inviteMatch && method === 'GET') {
      const token = inviteMatch[1];
      const convitesFile = path.join(DATA_DIR, 'convites.json');
      const convites = readJsonFile(convitesFile, []);
      const convite = Array.isArray(convites) ? convites.find(c => c.token === token) : null;

      if (!convite) {
        return sendJson(res, { success: false, message: 'Este link de convite é inválido ou foi cancelado pelo administrador.' }, 404);
      }
      if (convite.utilizado) {
        return sendJson(res, { success: false, message: 'Este link de convite já foi utilizado e não é mais válido.' }, 410);
      }

      return sendJson(res, { success: true, convite });
    }

    // 9. POST /api/admin/accept-invite (Ativação com troca de senha provisória totvs123)
    if (pathname === '/api/admin/accept-invite' && method === 'POST') {
      const body = await readBodyJson(req);
      const { token, senhaProvisoria, novaSenha } = body;

      if (!token || !senhaProvisoria || !novaSenha) {
        return sendJson(res, { success: false, message: 'Todos os campos são obrigatórios.' }, 400);
      }

      const senhaProvNorm = senhaProvisoria.trim();
      if (senhaProvNorm !== 'totvs123' && senhaProvNorm !== '123') {
        return sendJson(res, { success: false, message: 'Senha provisória incorreta. A senha padrão do convite é totvs123.' }, 400);
      }

      const senhaValida = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/.test(novaSenha.trim());
      if (!senhaValida) {
        return sendJson(res, { success: false, message: 'A nova senha deve possuir no mínimo 6 caracteres e conter obrigatoriamente letras e números.' }, 400);
      }

      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      const conviteIdx = convites.findIndex(c => c.token === token);
      if (conviteIdx === -1) {
        return sendJson(res, { success: false, message: 'Convite não encontrado ou inválido.' }, 404);
      }
      if (convites[conviteIdx].utilizado) {
        return sendJson(res, { success: false, message: 'Este convite já foi utilizado.' }, 410);
      }

      const convite = convites[conviteIdx];
      const nome = (body.nome || convite.nome || '').trim();
      const email = (body.email || convite.email || '').trim().toLowerCase();

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      if (usuarios.some(u => u.email.toLowerCase().trim() === email)) {
        return sendJson(res, { success: false, message: 'Já existe um usuário cadastrado com este e-mail.' }, 400);
      }

      const perfil = convite.perfil || (convite.token && convite.token.startsWith('adm_') ? 'adm' : (convite.token && convite.token.startsWith('esp_') ? 'especialista' : 'pmm'));
      const cargoDefault = perfil === 'adm' ? 'Administrador' : (perfil === 'especialista' ? (convite.cargo || 'Especialista do Espaço Experiência') : 'PMM (Gestor de Segmento)');

      const novoUsuario = {
        id: `usr-${Date.now()}`,
        nome: nome,
        email: email,
        senha: novaSenha.trim(),
        perfil: perfil,
        cargo: cargoDefault,
        dono_produto: false,
        foto: (body.foto || '').trim(),
        criado_em: new Date().toLocaleString('pt-BR')
      };

      usuarios.push(novoUsuario);
      writeJsonFile(usrFile, usuarios);

      convites[conviteIdx].utilizado = true;
      convites[conviteIdx].utilizado_em = new Date().toLocaleString('pt-BR');
      convites[conviteIdx].utilizado_por = novoUsuario.nome;
      convites[conviteIdx].email_utilizado = novoUsuario.email;
      writeJsonFile(convitesFile, convites);

      return sendJson(res, {
        success: true,
        message: 'Acesso ativado com sucesso!',
        usuario: {
          id: novoUsuario.id,
          nome: novoUsuario.nome,
          email: novoUsuario.email,
          perfil: novoUsuario.perfil,
          cargo: novoUsuario.cargo,
          dono_produto: false,
          foto: novoUsuario.foto
        }
      });
    }

    // 10. GET /api/admin/users & /api/usuarios (Lista de Perfis Cadastrados)
    if ((pathname === '/api/admin/users' || pathname === '/api/usuarios') && method === 'GET') {
      const usuarios = readJsonFile(path.join(DATA_DIR, 'usuarios.json'), []);
      const lista = Array.isArray(usuarios) ? usuarios : [usuarios];
      const listaSegura = lista.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        perfil: u.perfil || (u.cargo === 'PMM' ? 'pmm' : 'adm'),
        cargo: u.cargo || (u.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br' ? 'Dono do Produto' : (u.perfil === 'pmm' ? 'PMM' : 'Administrador')),
        dono_produto: u.dono_produto === true || u.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br',
        foto: u.foto || '',
        ativo: u.ativo !== false,
        precisa_trocar_senha: u.precisa_trocar_senha === true,
        criado_em: u.criado_em
      }));
      return sendJson(res, listaSegura);
    }

    // 11. DELETE /api/admin/users/:id & /api/usuarios/:id (Remover perfil com proteção do Dono do Produto)
    const delMatch = pathname.match(/^\/api\/(?:admin\/users|usuarios)\/([^/]+)$/);
    if (delMatch && method === 'DELETE') {
      const usrId = delMatch[1];
      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const alvo = usuarios.find(u => u.id === usrId);
      if (!alvo) {
        return sendJson(res, { success: false, message: 'Perfil não encontrado.' }, 404);
      }

      // Proteção absoluta do Dono do Produto (andre.gianotti@totvs.com.br)
      if (alvo.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br' || alvo.dono_produto === true) {
        return sendJson(res, { success: false, message: 'Operação não permitida: o Dono do Produto (andre.gianotti@totvs.com.br) possui imunidade e não pode ser excluído.' }, 403);
      }

      if (usuarios.length <= 1) {
        return sendJson(res, { success: false, message: 'Operação não permitida: não é possível remover o único administrador cadastrado no sistema.' }, 400);
      }

      usuarios = usuarios.filter(u => u.id !== usrId);
      writeJsonFile(usrFile, usuarios);

      // Registrar auditoria da exclusão
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: 'Administrador TOTVS',
          analista_email: 'adm@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'usuarios',
          segmento_nome: 'Gestão de Perfis',
          acao: 'Exclusão de Perfil',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `O perfil de "${alvo.nome}" (${alvo.email} - ${alvo.perfil || 'adm'}) foi excluído do sistema.`
        });
        writeJsonFile(auditFile, logs);
      } catch (eAudit) {}

      return sendJson(res, { success: true, message: 'Perfil removido com sucesso.' });
    }

    // 11.2 POST /api/admin/users/:id/toggle-status (Ativar / Desativar Perfil)
    const toggleStatusMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/toggle-status$/);
    if (toggleStatusMatch && method === 'POST') {
      const usrId = toggleStatusMatch[1];
      const body = await readBodyJson(req);
      const autorEmail = (body.autorEmail || '').toLowerCase().trim();
      const autorNome = body.autorNome || 'Administrador';

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const userIdx = usuarios.findIndex(u => u.id === usrId);
      if (userIdx === -1) {
        return sendJson(res, { success: false, message: 'Perfil não encontrado.' }, 404);
      }

      const alvo = usuarios[userIdx];
      const isDono = alvo.dono_produto === true || alvo.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br';

      if (isDono) {
        return sendJson(res, { success: false, message: 'Ação bloqueada: O Dono do Produto possui imunidade e não pode ser desativado.' }, 403);
      }

      if (alvo.email.toLowerCase().trim() === autorEmail) {
        return sendJson(res, { success: false, message: 'Operação não permitida: Você não pode desativar a sua própria conta em uso.' }, 400);
      }

      const novoStatus = !(alvo.ativo !== false);
      usuarios[userIdx].ativo = novoStatus;
      writeJsonFile(usrFile, usuarios);

      // Registrar auditoria
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: autorNome,
          analista_email: autorEmail || 'adm@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'usuarios',
          segmento_nome: 'Gestão de Perfis',
          acao: novoStatus ? 'Reativação de Perfil' : 'Desativação Temporária de Perfil',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `O perfil de "${alvo.nome}" (${alvo.email} - ${alvo.perfil || 'adm'}) foi ${novoStatus ? 'REATIVADO' : 'DESATIVADO'} por ${autorNome}.`
        });
        writeJsonFile(auditFile, logs);
      } catch (eAudit) {
        console.warn('Erro ao registrar log de auditoria no toggle-status:', eAudit);
      }

      return sendJson(res, {
        success: true,
        message: `Perfil de "${alvo.nome}" foi ${novoStatus ? 'reativado' : 'desativado'} com sucesso!`,
        ativo: novoStatus,
        usuarioId: alvo.id
      });
    }

    // 11.3 POST /api/admin/users/:id/reset-password (Resetar Senha para padrão 'totvs123' com troca obrigatória)
    const resetPassMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)\/reset-password$/);
    if (resetPassMatch && method === 'POST') {
      const usrId = resetPassMatch[1];
      const body = await readBodyJson(req);
      const autorEmail = (body.autorEmail || '').toLowerCase().trim();
      const autorNome = body.autorNome || 'Administrador';

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const userIdx = usuarios.findIndex(u => u.id === usrId);
      if (userIdx === -1) {
        return sendJson(res, { success: false, message: 'Perfil não encontrado.' }, 404);
      }

      const alvo = usuarios[userIdx];
      const isDono = alvo.dono_produto === true || alvo.email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br';

      if (isDono) {
        return sendJson(res, { success: false, message: 'Ação bloqueada: A senha do Dono do Produto possui imunidade e não pode ser redefinida por terceiros.' }, 403);
      }

      usuarios[userIdx].senha = 'totvs123';
      usuarios[userIdx].precisa_trocar_senha = true;
      writeJsonFile(usrFile, usuarios);

      // Registrar auditoria
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: autorNome,
          analista_email: autorEmail || 'adm@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'usuarios',
          segmento_nome: 'Gestão de Perfis',
          acao: 'Reset de Senha de Perfil',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `A senha de "${alvo.nome}" (${alvo.email}) foi resetada para a senha padrão inicial (totvs123) por ${autorNome}. Troca obrigatória no próximo login.`
        });
        writeJsonFile(auditFile, logs);
      } catch (eAudit) {
        console.warn('Erro ao registrar log de auditoria no reset-password:', eAudit);
      }

      return sendJson(res, {
        success: true,
        message: `Senha de "${alvo.nome}" redefinida para a inicial padrão (totvs123) com sucesso!`,
        senhaPadrao: 'totvs123',
        usuarioId: alvo.id
      });
    }

    // 11.1 POST /api/admin/avatar (Atualizar Foto de Perfil do Administrador)
    if (pathname === '/api/admin/avatar' && method === 'POST') {
      const body = await readBodyJson(req);
      const email = (body.email || '').trim().toLowerCase();
      const foto = (body.foto || '').trim();

      if (!email || !foto) {
        return sendJson(res, { success: false, message: 'E-mail e foto são obrigatórios.' }, 400);
      }

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const userIdx = usuarios.findIndex(u => u.email.toLowerCase().trim() === email);
      if (userIdx === -1) {
        return sendJson(res, { success: false, message: 'Administrador não encontrado.' }, 404);
      }

      usuarios[userIdx].foto = foto;
      writeJsonFile(usrFile, usuarios);

      return sendJson(res, {
        success: true,
        message: 'Foto de perfil atualizada com sucesso!',
        usuario: {
          id: usuarios[userIdx].id,
          nome: usuarios[userIdx].nome,
          email: usuarios[userIdx].email,
          perfil: usuarios[userIdx].perfil || 'adm',
          cargo: usuarios[userIdx].cargo,
          dono_produto: usuarios[userIdx].dono_produto === true || usuarios[userIdx].email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br',
          foto: foto
        }
      });
    }

    // 11.4 POST /api/admin/password & /api/auth/definir-nova-senha (Alterar Própria Senha / Definir Nova Senha Pós-Reset)
    if ((pathname === '/api/admin/password' || pathname === '/api/auth/definir-nova-senha') && method === 'POST') {
      const body = await readBodyJson(req);
      const email = (body.email || '').trim().toLowerCase();
      const novaSenha = (body.novaSenha || '').trim();

      if (!email || !novaSenha) {
        return sendJson(res, { success: false, message: 'E-mail e nova senha são obrigatórios.' }, 400);
      }
      const senhaValida = /^(?=.*[a-zA-Z])(?=.*[0-9]).{6,}$/.test(novaSenha);
      if (!senhaValida) {
        return sendJson(res, { success: false, message: 'A nova senha deve possuir no mínimo 6 caracteres e conter letras e números.' }, 400);
      }

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const idx = usuarios.findIndex(u => u.email.toLowerCase().trim() === email);
      if (idx === -1) {
        return sendJson(res, { success: false, message: 'Usuário não encontrado.' }, 404);
      }

      usuarios[idx].senha = novaSenha;
      usuarios[idx].precisa_trocar_senha = false;
      writeJsonFile(usrFile, usuarios);

      // Registrar auditoria
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: usuarios[idx].nome,
          analista_email: email,
          perfil: usuarios[idx].perfil || 'adm',
          segmento_id: 'seguranca',
          segmento_nome: 'Autenticação',
          acao: 'Atualização de Senha',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `O usuário "${usuarios[idx].nome}" (${email}) atualizou sua senha com sucesso.`
        });
        writeJsonFile(auditFile, logs);
      } catch (eAudit) {}

      return sendJson(res, {
        success: true,
        message: 'Senha atualizada com sucesso!',
        usuario: {
          id: usuarios[idx].id,
          nome: usuarios[idx].nome,
          email: usuarios[idx].email,
          perfil: usuarios[idx].perfil || 'adm',
          cargo: usuarios[idx].cargo,
          dono_produto: usuarios[idx].dono_produto === true || usuarios[idx].email.toLowerCase().trim() === 'andre.gianotti@totvs.com.br',
          foto: usuarios[idx].foto || '',
          ativo: usuarios[idx].ativo !== false,
          precisa_trocar_senha: false
        }
      });
    }

    // 12. GET /api/logs/access
    if (pathname === '/api/logs/access' && method === 'GET') {
      const logs = readJsonFile(path.join(DATA_DIR, 'logs_acesso.json'), []);
      const formatted = (Array.isArray(logs) ? logs : []).map(l => ({
        ...l,
        perfil: l.perfil || (l.tipo && l.tipo.toLowerCase().includes('especialista') ? 'especialista' : (l.tipo && l.tipo.toLowerCase().includes('pmm') ? 'pmm' : (l.tipo && (l.tipo.toLowerCase().includes('admin') || l.usuario) ? 'adm' : 'visitante')))
      }));
      return sendJson(res, formatted);
    }

    // 13. GET /api/logs/audit
    if (pathname === '/api/logs/audit' && method === 'GET') {
      const logs = readJsonFile(path.join(DATA_DIR, 'logs_auditoria.json'), []);
      const formatted = (Array.isArray(logs) ? logs : []).map(l => ({
        ...l,
        perfil: l.perfil || (l.autor?.perfil ? l.autor.perfil : (l.acao && l.acao.toLowerCase().includes('especialista') ? 'especialista' : (l.acao && l.acao.toLowerCase().includes('pmm') ? 'pmm' : 'adm')))
      }));
      return sendJson(res, formatted);
    }

    // 14. GET /api/admin/invites (Lista de Convites)
    if (pathname === '/api/admin/invites' && method === 'GET') {
      const convites = readJsonFile(path.join(DATA_DIR, 'convites.json'), []);
      return sendJson(res, Array.isArray(convites) ? convites : []);
    }

    // 14.1 DELETE /api/admin/invites/:tokenOrId (Excluir/Cancelar convite individual)
    const delInviteMatch = pathname.match(/^\/api\/admin\/invites\/([^/]+)$/);
    if (delInviteMatch && method === 'DELETE') {
      const tokenOrId = delInviteMatch[1];
      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      const alvo = convites.find(c => c.token === tokenOrId || c.id === tokenOrId);
      if (!alvo) {
        return sendJson(res, { success: false, message: 'Convite não encontrado.' }, 404);
      }

      convites = convites.filter(c => c.token !== tokenOrId && c.id !== tokenOrId);
      writeJsonFile(convitesFile, convites);

      // Registrar auditoria da exclusão
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: 'Administrador TOTVS',
          analista_email: 'adm@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'convites',
          segmento_nome: 'Gestão de Convites',
          acao: alvo.utilizado ? 'Remoção de convite concluído do histórico' : 'Cancelamento e revogação de link de convite',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `Convite de "${alvo.nome || 'Convidado'}" (${alvo.email || 'sem e-mail'}) com perfil ${alvo.perfil || 'adm'} foi excluído.`
        });
        writeJsonFile(auditFile, logs);
      } catch (errAud) {}

      return sendJson(res, { success: true, message: 'Convite excluído e link cancelado com sucesso.' });
    }

    // 14.2 DELETE /api/admin/invites (Excluir convites em lote: ?scope=used|all)
    if (pathname === '/api/admin/invites' && method === 'DELETE') {
      const scope = (parsedUrl.query.scope || 'used').toLowerCase();
      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      const totalAntes = convites.length;
      let removidos = 0;

      if (scope === 'all') {
        removidos = totalAntes;
        convites = [];
      } else {
        // scope === 'used'
        const mantidos = convites.filter(c => c.utilizado !== true && c.status !== 'utilizado');
        removidos = totalAntes - mantidos.length;
        convites = mantidos;
      }

      writeJsonFile(convitesFile, convites);

      // Registrar auditoria
      try {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        if (!Array.isArray(logs)) logs = [];
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: 'Administrador TOTVS',
          analista_email: 'adm@totvs.com.br',
          perfil: 'adm',
          segmento_id: 'convites',
          segmento_nome: 'Gestão de Convites',
          acao: scope === 'all' ? 'Limpeza total do histórico de convites (revogação geral)' : 'Limpeza de convites concluídos do histórico',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `${removidos} convite(s) removido(s) do histórico.`
        });
        writeJsonFile(auditFile, logs);
      } catch (errAud) {}

      return sendJson(res, {
        success: true,
        message: scope === 'all'
          ? `Todo o histórico de convites foi apagado e os links pendentes foram cancelados (${removidos} registros).`
          : `Histórico de convites concluídos limpo com sucesso (${removidos} registros removidos).`,
        removidos
      });
    }

    // 15. GET /api/visitors/metrics (Métricas dos Visitantes no Topo com Ano e Status do Formulário)
    if (pathname === '/api/visitors/metrics' && method === 'GET') {
      const visitors = readJsonFile(path.join(DATA_DIR, 'registro_visitantes.json'), []);
      const metrics = calculateVisitorMetrics(visitors);
      return sendJson(res, { success: true, ...metrics });
    }

    // 15.1 GET /api/visitors/history (Consulta de Histórico por Ano e Mês)
    if (pathname === '/api/visitors/history' && method === 'GET') {
      const visitors = readJsonFile(path.join(DATA_DIR, 'registro_visitantes.json'), []);
      const anoParam = parsedUrl.query.ano;
      const mesParam = parsedUrl.query.mes;
      const history = getVisitorHistory(visitors, anoParam, mesParam);
      return sendJson(res, { success: true, ...history });
    }

    // 15.2 POST /api/visitors/form-opened (Registrar Abertura do Google Forms no Dia)
    if (pathname === '/api/visitors/form-opened' && method === 'POST') {
      const status = setFormOpenedToday();
      return sendJson(res, {
        success: true,
        formulario_aberto_hoje: true,
        message: 'Abertura do formulário registrada para hoje!',
        ...status
      });
    }

    // 16. POST /api/visitors (Cadastrar Novo Visitante / Empresa com Validação Estrita)
    if (pathname === '/api/visitors' && method === 'POST') {
      const body = await readBodyJson(req);
      const dataVisita = (body.data || '').trim();
      const empresa = (body.empresa || body.nome || '').trim();
      const tipoVisitante = (body.tipo_visitante || '').trim().toLowerCase();
      const numPessoasRaw = parseInt(body.numero_pessoas, 10);
      const responsavel = (body.responsavel || '').trim();

      // Validação estrita de todos os 5 campos
      if (!dataVisita) {
        return sendJson(res, { success: false, message: 'A data da visita é obrigatória.' }, 400);
      }
      if (!empresa) {
        return sendJson(res, { success: false, message: 'O nome da empresa ou instituição visitante é obrigatório.' }, 400);
      }
      const tiposValidos = ['cliente', 'prospect', 'visitante_externo', 'visitante_interno'];
      if (!tipoVisitante || !tiposValidos.includes(tipoVisitante)) {
        return sendJson(res, { success: false, message: 'A classificação do visitante (Cliente, Prospect ou Visitante Interno) é obrigatória.' }, 400);
      }
      if (isNaN(numPessoasRaw) || numPessoasRaw < 1) {
        return sendJson(res, { success: false, message: 'O número de pessoas é obrigatório e deve ser no mínimo 1.' }, 400);
      }
      if (!responsavel) {
        return sendJson(res, { success: false, message: 'O nome do responsável / anfitrião TOTVS é obrigatório.' }, 400);
      }

      const numero_pessoas = numPessoasRaw;
      const visitorsFile = path.join(DATA_DIR, 'registro_visitantes.json');
      let visitors = readJsonFile(visitorsFile, []);
      if (!Array.isArray(visitors)) visitors = [];

      const novoVisitante = {
        id: `vis-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        data: dataVisita,
        empresa,
        nome: empresa, // retrocompatibilidade
        tipo_visitante: tipoVisitante,
        numero_pessoas,
        responsavel,
        criado_em: new Date().toLocaleString('pt-BR'),
        timestamp: Date.now(),
        link_formulario: "https://docs.google.com/forms/d/e/1FAIpQLSfQWaQrpLcHNW1HkOhe2RQ2AnpNEzb-Duna6hyP1__FxGalmQ/viewform"
      };

      visitors.unshift(novoVisitante);
      writeJsonFile(visitorsFile, visitors);

      const metrics = calculateVisitorMetrics(visitors);
      return sendJson(res, {
        success: true,
        message: 'Visita registrada com sucesso!',
        registro: novoVisitante,
        metrics
      });
    }

    // 17. GET /api/visitors (Listar Visitantes Cadastrados)
    if (pathname === '/api/visitors' && method === 'GET') {
      const visitors = readJsonFile(path.join(DATA_DIR, 'registro_visitantes.json'), []);
      return sendJson(res, Array.isArray(visitors) ? visitors : []);
    }

    // 18. DELETE /api/visitors/:id (Excluir Registro de Visitante)
    const delVisMatch = pathname.match(/^\/api\/visitors\/([^/]+)$/);
    if (delVisMatch && method === 'DELETE') {
      const visId = delVisMatch[1];
      const visitorsFile = path.join(DATA_DIR, 'registro_visitantes.json');
      let visitors = readJsonFile(visitorsFile, []);
      if (!Array.isArray(visitors)) visitors = [];

      visitors = visitors.filter(v => v.id !== visId);
      writeJsonFile(visitorsFile, visitors);

      const metrics = calculateVisitorMetrics(visitors);
      return sendJson(res, {
        success: true,
        message: 'Registro de visitante removido.',
        metrics
      });
    }

    // 19. GET /api/video/gestao (Consulta Pública do Vídeo da Gestão)
    if (pathname === '/api/video/gestao' && method === 'GET') {
      const videoConfig = readJsonFile(path.join(DATA_DIR, 'video_gestao.json'), {
        ativo: true,
        tipo: 'link',
        url: '',
        titulo: 'Discurso da Gestão',
        mensagem: 'Veja seu discurso aqui',
        subtitulo: 'Mensagem institucional da liderança aos visitantes do Espaço Experiência',
        nome_arquivo: null,
        tamanho_mb: null
      });
      return sendJson(res, { success: true, video: videoConfig });
    }

    // 20. POST /api/admin/video/config (Atualizar Configuração do Vídeo da Gestão)
    if (pathname === '/api/admin/video/config' && method === 'POST') {
      const body = await readBodyJson(req);
      const videoFile = path.join(DATA_DIR, 'video_gestao.json');
      const current = readJsonFile(videoFile, {});
      const updated = {
        ativo: body.ativo !== undefined ? Boolean(body.ativo) : true,
        tipo: body.tipo === 'arquivo' ? 'arquivo' : 'link',
        url: (body.url || current.url || '').trim(),
        titulo: (body.titulo || current.titulo || 'Discurso da Gestão').trim(),
        mensagem: (body.mensagem || current.mensagem || 'Veja seu discurso aqui').trim(),
        subtitulo: (body.subtitulo || current.subtitulo || 'Mensagem institucional da liderança aos visitantes').trim(),
        nome_arquivo: body.nome_arquivo || current.nome_arquivo || null,
        tamanho_mb: body.tamanho_mb !== undefined ? body.tamanho_mb : current.tamanho_mb,
        atualizado_em: new Date().toLocaleString('pt-BR'),
        atualizado_por: body.atualizado_por || 'Administrador'
      };
      writeJsonFile(videoFile, updated);
      return sendJson(res, { success: true, video: updated, message: 'Configuração do vídeo atualizada com sucesso!' });
    }

    // 21. POST /api/admin/video/upload (Upload de Arquivo Pesado .MOV / .MP4 por Streaming)
    if (pathname === '/api/admin/video/upload' && method === 'POST') {
      // Estender timeouts para permitir upload de arquivos pesados (até 15 min)
      req.setTimeout(900000);
      res.setTimeout(900000);

      const videosDir = path.join(BASE_DIR, 'uploads', 'videos');
      if (!fs.existsSync(videosDir)) {
        fs.mkdirSync(videosDir, { recursive: true });
      }

      const rawFilename = (req.headers['x-filename'] || parsedUrl.query.filename || 'discurso_gestao.mov');
      const decodedFilename = decodeURIComponent(rawFilename);
      const ext = path.extname(decodedFilename).toLowerCase() || '.mov';
      const cleanBaseName = path.basename(decodedFilename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const safeFilename = `discurso_${Date.now()}_${cleanBaseName}${ext}`;
      const targetFilePath = path.join(videosDir, safeFilename);

      const writeStream = fs.createWriteStream(targetFilePath);

      return new Promise((resolve) => {
        req.pipe(writeStream);

        writeStream.on('finish', () => {
          let fileSizeMb = 0;
          try {
            const stats = fs.statSync(targetFilePath);
            fileSizeMb = parseFloat((stats.size / (1024 * 1024)).toFixed(1));
          } catch (e) {}

          const videoUrl = `/uploads/videos/${safeFilename}`;
          const videoFile = path.join(DATA_DIR, 'video_gestao.json');
          const current = readJsonFile(videoFile, {});
          const updated = {
            ativo: true,
            tipo: 'arquivo',
            url: videoUrl,
            titulo: current.titulo || 'Discurso da Gestão',
            mensagem: current.mensagem || 'Veja seu discurso aqui',
            subtitulo: current.subtitulo || 'Mensagem institucional da liderança aos visitantes',
            nome_arquivo: decodedFilename,
            tamanho_mb: fileSizeMb,
            atualizado_em: new Date().toLocaleString('pt-BR'),
            atualizado_por: decodeURIComponent(req.headers['x-admin'] || 'Administrador')
          };
          writeJsonFile(videoFile, updated);

          sendJson(res, {
            success: true,
            message: 'Upload do vídeo realizado com sucesso!',
            url: videoUrl,
            nome_arquivo: decodedFilename,
            tamanho_mb: fileSizeMb,
            video: updated
          });
          resolve();
        });

        writeStream.on('error', (err) => {
          console.error('Erro ao gravar arquivo de vídeo no disco:', err);
          sendJson(res, { success: false, message: 'Falha ao gravar arquivo de vídeo: ' + err.message }, 500);
          resolve();
        });

        req.on('error', (err) => {
          console.error('Erro na transmissão do upload:', err);
          sendJson(res, { success: false, message: 'Erro na transmissão do arquivo: ' + err.message }, 500);
          resolve();
        });
      });
    }

    // 22. DELETE /api/admin/video (Excluir Vídeo da Gestão e Limpar Arquivo Físico do Disco)
    if (pathname === '/api/admin/video' && method === 'DELETE') {
      const videoFile = path.join(DATA_DIR, 'video_gestao.json');
      const current = readJsonFile(videoFile, {});

      // Se houver arquivo local gravado em uploads/videos/, apagar fisicamente do disco
      if (current && current.url && current.url.startsWith('/uploads/videos/')) {
        const localFileName = path.basename(current.url);
        const diskPath = path.join(BASE_DIR, 'uploads', 'videos', localFileName);
        try {
          if (fs.existsSync(diskPath)) {
            fs.unlinkSync(diskPath);
            console.log(`[DELETE VIDEO] Arquivo removido do disco: ${diskPath}`);
          }
        } catch (e) {
          console.error(`[DELETE VIDEO] Erro ao remover arquivo do disco: ${e.message}`);
        }
      }

      const resetConfig = {
        ativo: true,
        tipo: 'arquivo',
        url: '',
        titulo: 'Discurso da Gestão',
        mensagem: 'Veja seu discurso aqui',
        subtitulo: 'Mensagem institucional da liderança aos visitantes do Espaço Experiência',
        nome_arquivo: null,
        tamanho_mb: null,
        atualizado_em: new Date().toLocaleString('pt-BR'),
        atualizado_por: decodeURIComponent(req.headers['x-admin'] || 'Administrador')
      };

      writeJsonFile(videoFile, resetConfig);

      // Log de Auditoria
      const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
      let logs = readJsonFile(auditFile, []);
      if (Array.isArray(logs)) {
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: resetConfig.atualizado_por || 'Administrador',
          analista_email: 'adm@totvs.com.br',
          segmento_id: 'video-gestao',
          segmento_nome: 'Vídeo da Gestão',
          acao: 'Exclusão do vídeo institucional',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `Vídeo "${current?.nome_arquivo || current?.url || 'institucional'}" excluído do servidor pelo administrador.`
        });
        writeJsonFile(auditFile, logs);
      }

      return sendJson(res, {
        success: true,
        message: 'Vídeo institucional excluído com sucesso!',
        video: resetConfig
      });
    }

    // 23. GET /api/plantonistas (Listar especialistas e escalas do ano)
    if (pathname === '/api/plantonistas' && method === 'GET') {
      const plantonistasFile = path.join(DATA_DIR, 'plantonistas.json');
      const data = readJsonFile(plantonistasFile, { especialistas: [], escalas: {} });
      return sendJson(res, { success: true, ...data });
    }

    // 24. POST /api/plantonistas/escala (Atribuir / Atualizar plantonista para uma data)
    if (pathname === '/api/plantonistas/escala' && method === 'POST') {
      const body = await readBodyJson(req);
      const { data, especialista_id, nome, turno, observacoes, autor } = body;
      if (!data) {
        return sendJson(res, { success: false, message: 'Data é obrigatória (formato YYYY-MM-DD)' }, 400);
      }

      const plantonistasFile = path.join(DATA_DIR, 'plantonistas.json');
      let current = readJsonFile(plantonistasFile, { especialistas: [], escalas: {} });
      if (!current.escalas) current.escalas = {};

      if (!especialista_id && !nome) {
        delete current.escalas[data];
      } else {
        current.escalas[data] = {
          especialista_id: especialista_id || null,
          nome: nome || 'Especialista TOTVS',
          turno: turno || '09:00 - 18:00',
          observacoes: observacoes || ''
        };
      }

      writeJsonFile(plantonistasFile, current);

      // Log de Auditoria
      const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
      let logs = readJsonFile(auditFile, []);
      if (Array.isArray(logs)) {
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: autor?.nome || 'Administrador',
          analista_email: autor?.email || 'admin@totvs.com.br',
          segmento_id: 'plantonistas',
          segmento_nome: 'Escala de Plantonistas',
          acao: 'Atualização de escala de plantonista',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `Escala da data ${data} atualizada para ${nome || 'Sem escala'} por ${autor?.nome || 'Administrador'}.`
        });
        writeJsonFile(auditFile, logs);
      }

      return sendJson(res, { success: true, message: 'Escala atualizada com sucesso!', escalas: current.escalas });
    }

    // 25. POST /api/plantonistas/importar-lote (Importação em lote de escala anual via planilha)
    if (pathname === '/api/plantonistas/importar-lote' && method === 'POST') {
      const body = await readBodyJson(req);
      const { ano, escalasNovas, novosEspecialistas, autor } = body;
      if (!ano || !escalasNovas) {
        return sendJson(res, { success: false, message: 'Parâmetros "ano" e "escalasNovas" são obrigatórios.' }, 400);
      }

      const plantonistasFile = path.join(DATA_DIR, 'plantonistas.json');
      let current = readJsonFile(plantonistasFile, { especialistas: [], escalas: {} });
      if (!Array.isArray(current.especialistas)) current.especialistas = [];
      if (!current.escalas || typeof current.escalas !== 'object') current.escalas = {};

      // 1. Cadastrar novos especialistas sem duplicar existentes
      if (Array.isArray(novosEspecialistas) && novosEspecialistas.length > 0) {
        novosEspecialistas.forEach(nEsp => {
          const exists = current.especialistas.some(e => 
            (nEsp.email && e.email && e.email.trim().toLowerCase() === nEsp.email.trim().toLowerCase()) ||
            (nEsp.nome && e.nome && e.nome.trim().toLowerCase() === nEsp.nome.trim().toLowerCase()) ||
            e.id === nEsp.id
          );
          if (!exists) {
            current.especialistas.push(nEsp);
          }
        });
      }

      // 2. Limpar as escalas do ano importado para substituição limpa e atômica
      const anoPrefix = `${ano}-`;
      Object.keys(current.escalas).forEach(d => {
        if (d.startsWith(anoPrefix)) {
          delete current.escalas[d];
        }
      });

      // 3. Mesclar as novas escalas do ano
      Object.assign(current.escalas, escalasNovas);

      // 4. Salvar arquivo
      writeJsonFile(plantonistasFile, current);

      // 5. Registrar log de auditoria
      const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
      let logs = readJsonFile(auditFile, []);
      if (Array.isArray(logs)) {
        const totalImportados = Object.keys(escalasNovas).length;
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: autor?.nome || 'Administrador',
          analista_email: autor?.email || 'admin@totvs.com.br',
          segmento_id: 'plantonistas',
          segmento_nome: 'Escala de Plantonistas',
          acao: 'Importação anual de escala via planilha Excel',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: `Importação da escala do ano ${ano}: ${totalImportados} datas processadas por ${autor?.nome || 'Administrador'}.`
        });
        writeJsonFile(auditFile, logs);
      }

      return sendJson(res, {
        success: true,
        message: `Escala de ${ano} importada com sucesso! (${Object.keys(escalasNovas).length} datas)`,
        especialistas: current.especialistas,
        escalas: current.escalas
      });
    }

    // 10. Static files
    let relPath = pathname.replace(/^\/+/, '');
    if (!relPath) relPath = 'index.html';
    const filePath = path.join(BASE_DIR, relPath);

    // Prevent directory traversal
    if (!filePath.startsWith(BASE_DIR)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      return res.end('403 Forbidden');
    }

    serveStaticFile(req, res, filePath);
  } catch (err) {
    console.error(`Internal server error on [${method} ${pathname}]:`, err);
    sendJson(res, { success: false, error: err.message }, 500);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`==========================================================`);
  console.log(`  ESPACIO EXPERIENCIA TOTVS - SERVIDOR NODE.JS ATIVO`);
  console.log(`  Local:   http://localhost:${PORT}`);
  console.log(`==========================================================`);
});
