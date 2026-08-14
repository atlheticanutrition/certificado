/* ===================================================================
   Backend do totem — recebe o PDF do certificado (já gerado no
   navegador, em base64) e envia por e-mail (Microsoft Graph) ou
   WhatsApp.

   Rotas:
     POST /api/enviar-certificado           { email, nome, curso, dataConclusao, pdfBase64 }
     POST /api/enviar-certificado-whatsapp  { telefone, nome, curso, dataConclusao, pdfBase64 }
     GET  /api/whatsapp-status              { status: 'connected'|'connecting'|'disconnected' }
     GET  /api/whatsapp-qr                  PNG do QR code (setup do WhatsApp), quando pendente
   Header obrigatório nas rotas acima (exceto /api/health): X-Totem-Key: <mesma chave do .env>

   Configuração: copie .env.example para .env e preencha as
   credenciais do app do Azure AD (Microsoft Graph). Ver README.md
   nesta pasta para o passo a passo de deploy no VPS e para a
   configuração do WhatsApp (Baileys).
   =================================================================== */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const graphMailer = require('./graphMailer');
const rateLimit = require('express-rate-limit');
const whatsapp = require('./whatsapp');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1); // necessário para o rate-limit funcionar certo atrás de nginx/proxy

// CORS liberado: o endpoint é protegido por API key + rate limit, não por
// origem (o totem pode rodar como arquivo local, o que manda Origin "null").
app.use(cors());
app.use(express.json({ limit: '6mb' }));

const PORT = process.env.PORT || 3001;
const API_KEY = process.env.API_KEY;
const MAX_PDF_BASE64_CHARS = 4000000; // ~3MB de PDF real — bem folgado

if (!API_KEY) {
  console.error('ERRO: defina API_KEY no .env antes de subir o servidor.');
  process.exit(1);
}
if (!graphMailer.isConfigured()) {
  console.error(
    'ERRO: defina AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET e ' +
    'GRAPH_SENDER_EMAIL no .env antes de subir o servidor.'
  );
  process.exit(1);
}

var sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos
  max: 20,                  // 20 envios por IP a cada 10 min — sobra para um totem
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Muitas tentativas. Tente novamente em alguns minutos.' }
});

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function isValidPhone(value) {
  var digits = String(value || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 13;
}

function requireApiKey(req, res, next) {
  if (req.headers['x-totem-key'] !== API_KEY) {
    return res.status(401).json({ error: 'Não autorizado.' });
  }
  next();
}

app.get('/api/health', function (req, res) {
  res.json({ ok: true });
});

app.post('/api/enviar-certificado', sendLimiter, requireApiKey, async function (req, res) {
  try {
    var body = req.body || {};
    var email = body.email;
    var nome = body.nome || '';
    var curso = body.curso || '';
    var dataConclusao = body.dataConclusao || '';
    var pdfBase64 = body.pdfBase64;

    if (!isValidEmail(email)) {
      return res.status(400).json({ error: 'E-mail inválido.' });
    }
    if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length < 100) {
      return res.status(400).json({ error: 'PDF do certificado ausente ou inválido.' });
    }
    if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return res.status(413).json({ error: 'PDF do certificado excede o tamanho máximo permitido.' });
    }

    await graphMailer.sendMail({
      to: email,
      subject: 'Seu certificado — Atlhetica Nutrition',
      text: 'Olá ' + nome + ',\n\n' +
        'Segue em anexo o certificado do curso/treinamento "' + curso + '", ' +
        'concluído em ' + dataConclusao + '.\n\n' +
        'Atlhetica Nutrition',
      attachments: [
        {
          filename: 'certificado.pdf',
          content: Buffer.from(pdfBase64, 'base64'),
          contentType: 'application/pdf'
        }
      ]
    });

    res.json({ ok: true });
  } catch (err) {
    console.error('Erro ao enviar certificado por e-mail:', err);
    res.status(502).json({ error: 'Falha ao enviar o e-mail. Tente novamente.' });
  }
});

var WHATSAPP_ENABLED = process.env.WHATSAPP_ENABLED === 'true';

app.get('/api/whatsapp-status', requireApiKey, function (req, res) {
  res.json({ enabled: WHATSAPP_ENABLED, status: WHATSAPP_ENABLED ? whatsapp.getStatus() : 'disabled' });
});

// PNG do QR code atual, útil pra escanear sem depender do terminal do VPS
// (ex: abrir a URL no navegador durante o setup). Fica vazio depois de
// conectado.
app.get('/api/whatsapp-qr', requireApiKey, function (req, res) {
  if (!WHATSAPP_ENABLED) {
    return res.status(404).json({ error: 'WhatsApp desabilitado (WHATSAPP_ENABLED != true no .env).' });
  }
  var dataUrl = whatsapp.getQrDataUrl();
  if (!dataUrl) {
    return res.status(404).json({ error: 'Nenhum QR code pendente no momento (já conectado ou ainda gerando).' });
  }
  var base64 = dataUrl.substring(dataUrl.indexOf('base64,') + 'base64,'.length);
  res.set('Content-Type', 'image/png');
  res.send(Buffer.from(base64, 'base64'));
});

app.post('/api/enviar-certificado-whatsapp', sendLimiter, requireApiKey, async function (req, res) {
  try {
    if (!WHATSAPP_ENABLED) {
      return res.status(503).json({ error: 'Envio por WhatsApp desabilitado no servidor (veja server/README.md).' });
    }

    var body = req.body || {};
    var telefone = body.telefone;
    var nome = body.nome || '';
    var curso = body.curso || '';
    var dataConclusao = body.dataConclusao || '';
    var pdfBase64 = body.pdfBase64;

    if (!isValidPhone(telefone)) {
      return res.status(400).json({ error: 'Telefone inválido.' });
    }
    if (!pdfBase64 || typeof pdfBase64 !== 'string' || pdfBase64.length < 100) {
      return res.status(400).json({ error: 'PDF do certificado ausente ou inválido.' });
    }
    if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
      return res.status(413).json({ error: 'PDF do certificado excede o tamanho máximo permitido.' });
    }
    if (whatsapp.getStatus() !== 'connected') {
      return res.status(503).json({ error: 'WhatsApp não está conectado no servidor no momento.' });
    }

    await whatsapp.sendCertificado(telefone, {
      nome: nome,
      curso: curso,
      dataConclusao: dataConclusao,
      pdfBuffer: Buffer.from(pdfBase64, 'base64')
    });

    res.json({ ok: true });
  } catch (err) {
    if (err && err.code === 'NUMBER_NOT_ON_WHATSAPP') {
      return res.status(400).json({ error: 'Esse número não tem WhatsApp ativo.' });
    }
    if (err && err.code === 'WHATSAPP_NOT_CONNECTED') {
      return res.status(503).json({ error: 'WhatsApp não está conectado no servidor no momento.' });
    }
    console.error('Erro ao enviar certificado por WhatsApp:', err);
    res.status(502).json({ error: 'Falha ao enviar pelo WhatsApp. Tente novamente.' });
  }
});

app.listen(PORT, function () {
  console.log('Servidor do totem rodando na porta ' + PORT);
});

if (WHATSAPP_ENABLED) {
  whatsapp.connect().catch(function (err) {
    console.error('Falha ao iniciar conexão com o WhatsApp:', err);
  });
} else {
  console.log('WhatsApp desabilitado (defina WHATSAPP_ENABLED=true no .env para ativar).');
}
