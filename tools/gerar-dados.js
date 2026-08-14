// Converte "assets/Modelo Certificado.xlsx" em "certificados-data.js",
// o arquivo que o totem realmente lê (sem depender de Excel/planilha em tempo real).
//
// Uso: node tools/gerar-dados.js
// Requer: npm install xlsx   (rodar dentro da pasta tools/)

const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(__dirname, '..');
const XLSX_PATH = path.join(PROJECT_ROOT, 'assets', 'Modelo Certificado.xlsx');
const OUTPUT_PATH = path.join(PROJECT_ROOT, 'certificados-data.js');

const COL_CPF = 'CPF';
const COL_ANO = 'Ano de Nascimento';
const COL_CHAVE = 'Chave de Validação';
const COL_NOME = 'Nome Completo';
const COL_CURSO = 'Treinamento/Curso';
const COL_DIA = 'Dia';
const COL_MES = 'Mês';
const COL_ANO_CONCLUSAO = 'Ano';
const COL_CARGA = 'Carga';

function onlyDigits(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

// Monta a data de conclusão por extenso a partir das colunas Dia/Mês/Ano
// (ex: "13 de agosto de 2026"). Se dia, mês ou ano estiverem vazios,
// devolve string vazia.
function formatData(dia, mes, ano) {
  const diaStr = String(dia == null ? '' : dia).trim();
  const mesStr = String(mes == null ? '' : mes).trim();
  const anoStr = String(ano == null ? '' : ano).trim();
  if (!diaStr || !mesStr || !anoStr) return '';
  return `${diaStr} de ${mesStr.toLowerCase()} de ${anoStr}`;
}

const wb = XLSX.readFile(XLSX_PATH, { cellDates: true });
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const registros = [];
const avisos = [];

rows.forEach((row, i) => {
  const linha = i + 2; // +2: cabeçalho ocupa a linha 1 do Excel
  const cpfDigits = onlyDigits(row[COL_CPF]).padStart(11, '0');
  const ano = onlyDigits(row[COL_ANO]).padStart(4, '0');
  const nome = String(row[COL_NOME] || '').trim();

  if (!cpfDigits.replace(/0/g, '') || !ano.replace(/0/g, '') || !nome) {
    // Linha vazia/incompleta — ignora silenciosamente (comum em planilhas com linhas em branco no fim).
    return;
  }

  const cpf4 = cpfDigits.slice(-4);
  const chaveEsperada = cpf4 + ano;
  const chaveInformada = onlyDigits(row[COL_CHAVE]);
  if (chaveInformada && chaveInformada !== chaveEsperada) {
    avisos.push(`Linha ${linha} (${nome}): "Chave de Validação" (${chaveInformada}) não bate com CPF+Ano calculados (${chaveEsperada}). Confira o CPF e o Ano de Nascimento dessa linha.`);
  }

  registros.push({
    cpf: cpfDigits,
    cpf4,
    anoNascimento: ano,
    nome,
    curso: String(row[COL_CURSO] || '').trim(),
    dataConclusao: formatData(row[COL_DIA], row[COL_MES], row[COL_ANO_CONCLUSAO]),
    cargaHoraria: String(row[COL_CARGA] || '').trim()
  });
});

const header = `// Gerado automaticamente a partir de "assets/Modelo Certificado.xlsx" — NÃO editar à mão.
// Para atualizar: edite a planilha e rode "node tools/gerar-dados.js" (veja tools/README.md).
// Gerado em: ${new Date().toISOString()}
`;

const content = `${header}window.CERTIFICADOS_DATA = ${JSON.stringify(registros, null, 2)};\n`;

fs.writeFileSync(OUTPUT_PATH, content, 'utf8');

console.log(`OK: ${registros.length} certificado(s) exportado(s) para certificados-data.js`);
if (avisos.length) {
  console.log('\nAvisos:');
  avisos.forEach(a => console.log(' - ' + a));
}
