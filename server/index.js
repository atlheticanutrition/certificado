/* ===================================================================
   Backend do totem — recebe o PDF do certificado (já gerado no
   navegador, em base64) e envia por e-mail via Microsoft Graph.

   Rota:
     POST /api/enviar-certificado  { email, nome, curso, dataConclusao, cargaHoraria, pdfBase64 }
   Header obrigatório (exceto /api/health): X-Totem-Key: <mesma chave do .env>

   Configuração: copie .env.example para .env e preencha as
   credenciais do app do Azure AD (Microsoft Graph). Ver README.md
   nesta pasta para o passo a passo de deploy no VPS.
   =================================================================== */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const graphMailer = require('./graphMailer');
const rateLimit = require('express-rate-limit');

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

var MESES_EXTENSO = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
];

// Converte "dd/mm/aaaa" para "dd de <mês> de aaaa". Se o formato não bater,
// devolve o valor original sem alterações.
function dataPorExtenso(value) {
  var m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(value || '').trim());
  if (!m) return value;
  var dia = parseInt(m[1], 10);
  var mes = MESES_EXTENSO[parseInt(m[2], 10) - 1];
  var ano = m[3];
  if (!mes) return value;
  return dia + ' de ' + mes + ' de ' + ano;
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
    var cargaHoraria = body.cargaHoraria || '';
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
      subject: 'Seu Certificado - ADS Laboratório',
      text: 'Olá ' + nome + '\n\n' +
        'Segue em anexo o certificado curso/treinamento "' + curso + '" concluído em ' +
        dataPorExtenso(dataConclusao) + '.\n\n' +
        'Parabéns pelo seu empenho e dedicação\n\n' +
        'Abraços Steve Ball',
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

app.listen(PORT, function () {
  console.log('Servidor do totem rodando na porta ' + PORT);
});
