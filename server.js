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
    visitantes_mes: visitantesMesEspecifico
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

      // Audit log
      if (body.autor) {
        const auditFile = path.join(DATA_DIR, 'logs_auditoria.json');
        let logs = readJsonFile(auditFile, []);
        logs.unshift({
          id: `aud-${Date.now()}`,
          analista_nome: body.autor.nome || 'Analista TOTVS',
          analista_email: body.autor.email || 'analista@totvs.com.br',
          segmento_id: segId,
          segmento_nome: body.segmento?.nome || '',
          acao: 'Edição do card com validação manual',
          data_formatada: new Date().toLocaleDateString('pt-BR'),
          horario_formatado: new Date().toLocaleTimeString('pt-BR'),
          timestamp: Date.now(),
          detalhes: body.detalhes || 'Atualização realizada pelo especialista.'
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

      const adm = usuarios.find(u => u.email.toLowerCase().trim() === email && (u.senha === senha || u.pin === senha));
      if (!adm) {
        return sendJson(res, { success: false, message: 'E-mail ou senha incorretos.' }, 401);
      }

      return sendJson(res, {
        success: true,
        usuario: {
          id: adm.id,
          nome: adm.nome,
          email: adm.email,
          cargo: adm.cargo || 'Administrador'
        }
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

    // 7. POST /api/admin/invite (Gerar Link de Convite)
    if (pathname === '/api/admin/invite' && method === 'POST') {
      const body = await readBodyJson(req);
      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      const token = 'adm_' + Math.random().toString(36).substring(2, 9) + Date.now().toString(36);
      const novoConvite = {
        id: `conv-${Date.now()}`,
        token,
        criado_por: body.criado_por || 'Administrador',
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
        return sendJson(res, { success: false, message: 'Link de convite inválido ou não encontrado.' }, 404);
      }
      if (convite.utilizado) {
        return sendJson(res, { success: false, message: 'Este link de convite já foi utilizado.' }, 410);
      }

      return sendJson(res, { success: true, convite });
    }

    // 9. POST /api/admin/accept-invite (Ativação do Novo ADM com troca de totvs123)
    if (pathname === '/api/admin/accept-invite' && method === 'POST') {
      const body = await readBodyJson(req);
      const { token, nome, email, senhaProvisoria, novaSenha } = body;

      if (!token || !nome || !email || !senhaProvisoria || !novaSenha) {
        return sendJson(res, { success: false, message: 'Todos os campos são obrigatórios.' }, 400);
      }

      if (senhaProvisoria.trim() !== 'totvs123') {
        return sendJson(res, { success: false, message: 'Senha provisória incorreta. A senha padrão do convite é totvs123.' }, 400);
      }

      if (novaSenha.trim().length < 4) {
        return sendJson(res, { success: false, message: 'A nova senha deve possuir pelo menos 4 caracteres.' }, 400);
      }

      const convitesFile = path.join(DATA_DIR, 'convites.json');
      let convites = readJsonFile(convitesFile, []);
      if (!Array.isArray(convites)) convites = [];

      const conviteIdx = convites.findIndex(c => c.token === token);
      if (conviteIdx === -1) {
        return sendJson(res, { success: false, message: 'Convite não encontrado.' }, 404);
      }
      if (convites[conviteIdx].utilizado) {
        return sendJson(res, { success: false, message: 'Este convite já foi utilizado.' }, 410);
      }

      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      const emailNormalized = email.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
      if (!emailRegex.test(emailNormalized)) {
        return sendJson(res, { success: false, message: 'O endereço de e-mail informado não possui um formato válido (exemplo: usuario@empresa.com.br).' }, 400);
      }
      if (usuarios.some(u => u.email.toLowerCase().trim() === emailNormalized)) {
        return sendJson(res, { success: false, message: 'Já existe um administrador cadastrado com este e-mail.' }, 400);
      }

      const novoAdm = {
        id: `adm-${Date.now()}`,
        nome: nome.trim(),
        email: emailNormalized,
        senha: novaSenha.trim(),
        cargo: 'Administrador',
        criado_em: new Date().toLocaleString('pt-BR')
      };

      usuarios.push(novoAdm);
      writeJsonFile(usrFile, usuarios);

      convites[conviteIdx].utilizado = true;
      convites[conviteIdx].utilizado_em = new Date().toLocaleString('pt-BR');
      convites[conviteIdx].utilizado_por = novoAdm.nome;
      writeJsonFile(convitesFile, convites);

      return sendJson(res, {
        success: true,
        message: 'Administrador ativado com sucesso!',
        usuario: {
          id: novoAdm.id,
          nome: novoAdm.nome,
          email: novoAdm.email,
          cargo: novoAdm.cargo
        }
      });
    }

    // 10. GET /api/admin/users & /api/usuarios (Lista de ADMs)
    if ((pathname === '/api/admin/users' || pathname === '/api/usuarios') && method === 'GET') {
      const usuarios = readJsonFile(path.join(DATA_DIR, 'usuarios.json'), []);
      const lista = Array.isArray(usuarios) ? usuarios : [usuarios];
      const listaSegura = lista.map(u => ({
        id: u.id,
        nome: u.nome,
        email: u.email,
        cargo: u.cargo || 'Administrador',
        criado_em: u.criado_em
      }));
      return sendJson(res, listaSegura);
    }

    // 11. DELETE /api/admin/users/:id & /api/usuarios/:id (Remover ADM com proteção do último)
    const delMatch = pathname.match(/^\/api\/(?:admin\/users|usuarios)\/([^/]+)$/);
    if (delMatch && method === 'DELETE') {
      const usrId = delMatch[1];
      const usrFile = path.join(DATA_DIR, 'usuarios.json');
      let usuarios = readJsonFile(usrFile, []);
      if (!Array.isArray(usuarios)) usuarios = [usuarios];

      if (usuarios.length <= 1) {
        return sendJson(res, { success: false, message: 'Operação não permitida: não é possível remover o único administrador cadastrado no sistema.' }, 400);
      }

      usuarios = usuarios.filter(u => u.id !== usrId);
      writeJsonFile(usrFile, usuarios);
      return sendJson(res, { success: true, message: 'Administrador removido com sucesso.' });
    }

    // 12. GET /api/logs/access
    if (pathname === '/api/logs/access' && method === 'GET') {
      const logs = readJsonFile(path.join(DATA_DIR, 'logs_acesso.json'), []);
      return sendJson(res, logs);
    }

    // 13. GET /api/logs/audit
    if (pathname === '/api/logs/audit' && method === 'GET') {
      const logs = readJsonFile(path.join(DATA_DIR, 'logs_auditoria.json'), []);
      return sendJson(res, logs);
    }

    // 14. GET /api/admin/invites (Lista de Convites)
    if (pathname === '/api/admin/invites' && method === 'GET') {
      const convites = readJsonFile(path.join(DATA_DIR, 'convites.json'), []);
      return sendJson(res, Array.isArray(convites) ? convites : []);
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
      const numPessoasRaw = parseInt(body.numero_pessoas, 10);
      const responsavel = (body.responsavel || '').trim();

      // Validação estrita de todos os 4 campos
      if (!dataVisita) {
        return sendJson(res, { success: false, message: 'A data da visita é obrigatória.' }, 400);
      }
      if (!empresa) {
        return sendJson(res, { success: false, message: 'O nome da empresa ou instituição visitante é obrigatório.' }, 400);
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
