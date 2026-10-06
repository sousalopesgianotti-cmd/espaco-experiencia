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

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getStartAndEndOfWeek(d) {
  const date = new Date(d);
  const day = date.getDay();
  const diffToMonday = (day === 0 ? -6 : 1) - day;
  const monday = new Date(date);
  monday.setDate(date.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return { monday, sunday };
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
  const now = new Date();
  const horario = now.toLocaleTimeString('pt-BR');
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
  const now = new Date();
  const todayStr = getTodayString();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  const { monday, sunday } = getStartAndEndOfWeek(now);

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
    const dataStr = v.data.slice(0, 10);
    if (dataStr === todayStr) {
      hoje += qtdPessoas;
    }

    const parts = dataStr.split('-');
    if (parts.length === 3) {
      const vYear = parseInt(parts[0], 10);
      const vMonth = parseInt(parts[1], 10) - 1;
      const vDay = parseInt(parts[2], 10);
      const vDate = new Date(vYear, vMonth, vDay, 12, 0, 0);

      // Acumulado do Ano Atual (na virada de ano, renova para o novo ano)
      if (vYear === currentYear) {
        ano += qtdPessoas;
      }

      if (vYear === currentYear && vMonth === currentMonth) {
        mes += qtdPessoas;
      }

      if (vDate >= monday && vDate <= sunday) {
        semana += qtdPessoas;
      }
    }
  }

  const formStatus = getFormStatus();

  return {
    hoje,
    semana,
    mes,
    ano,
    ano_atual: currentYear,
    total,
    formulario_aberto_hoje: formStatus.formulario_aberto_hoje,
    ultimo_horario_formulario: formStatus.ultimo_horario
  };
}

function getVisitorHistory(visitors, targetYear, targetMonth) {
  if (!Array.isArray(visitors)) visitors = [];
  const currentYear = new Date().getFullYear();
  const yearToUse = parseInt(targetYear, 10) || currentYear;

  const anosSet = new Set([currentYear]);
  for (const v of visitors) {
    if (v && v.data) {
      const y = parseInt(v.data.slice(0, 4), 10);
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
    const parts = v.data.slice(0, 10).split('-');
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
    if (range && (ext === '.mp4' || ext === '.webm')) {
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
