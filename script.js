(function () {
  'use strict';

  /* ===================================================================
     Stage scaling — keeps the 1920x1080 kiosk layout pixel-perfect on
     any actual monitor resolution/window size.

     Abaixo de MOBILE_BREAKPOINT a página troca para o layout fluido em
     coluna (ver media query no fim do style.css) em vez de miniaturizar
     o canvas do totem — miniaturizar um layout 16:9 numa tela de celular
     em pé geraria barras pretas enormes em vez de se adaptar de verdade.
     =================================================================== */
  var stage = document.getElementById('stage');
  var MOBILE_BREAKPOINT = 900;
  var mobileQuery = window.matchMedia('(max-width: ' + MOBILE_BREAKPOINT + 'px)');

  function scaleStage() {
    if (mobileQuery.matches) {
      stage.style.transform = 'none';
      return;
    }
    var scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    stage.style.transform = 'scale(' + scale + ')';
  }
  scaleStage();
  window.addEventListener('resize', scaleStage);
  // Safari antigo não tem addEventListener em MediaQueryList.
  if (mobileQuery.addEventListener) {
    mobileQuery.addEventListener('change', scaleStage);
  } else if (mobileQuery.addListener) {
    mobileQuery.addListener(scaleStage);
  }

  /* ===================================================================
     Escala da pré-visualização do certificado (.certificate-preview
     mantém tamanho nativo 937.6x662.67 sempre — só encolhemos
     visualmente via CSS var --cert-scale para caber no layout fluido do
     mobile). No modo kiosk/desktop o frame já nasce com 937.6px de
     largura fixa, então o scale calculado dá 1 e não muda nada.
     =================================================================== */
  var CERT_NATIVE_WIDTH = 937.6;
  var certFrame = document.querySelector('.certificate-frame');
  var certPreview = document.querySelector('.certificate-preview');

  function applyCertScale(width) {
    if (!width) return;
    var scale = width / CERT_NATIVE_WIDTH;
    certPreview.style.setProperty('--cert-scale', scale);
  }

  if (certFrame && certPreview) {
    if (window.ResizeObserver) {
      new ResizeObserver(function (entries) {
        applyCertScale(entries[0].contentRect.width);
      }).observe(certFrame);
    } else {
      // Fallback sem ResizeObserver: recalcula nos mesmos gatilhos do stage.
      var recalcCertScale = function () { applyCertScale(certFrame.getBoundingClientRect().width); };
      recalcCertScale();
      window.addEventListener('resize', recalcCertScale);
    }
  }

  // Kiosk hardening: no context menu, no accidental text selection/drag.
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  document.addEventListener('dragstart', function (e) { e.preventDefault(); });

  /* ===================================================================
     Certificate database
     Loaded from certificados-data.js (generated from
     assets/Modelo Certificado.xlsx — see tools/README.md to regenerate
     it after editing the spreadsheet).
     =================================================================== */
  var CERTIFICADOS_DATA = window.CERTIFICADOS_DATA || [];
  if (!window.CERTIFICADOS_DATA) {
    console.warn('certificados-data.js não foi carregado — nenhum certificado disponível para busca.');
  }

  function lookupCertificado(cpf4, anoNascimento) {
    return CERTIFICADOS_DATA.find(function (r) {
      return r.cpf4 === cpf4 && r.anoNascimento === anoNascimento;
    }) || null;
  }

  /* ===================================================================
     Screen switching
     =================================================================== */
  var screens = {
    search: document.getElementById('screen-search'),
    result: document.getElementById('screen-result')
  };

  function showScreen(name) {
    Object.keys(screens).forEach(function (key) {
      screens[key].setAttribute('data-active', key === name ? 'true' : 'false');
    });
  }

  /* ===================================================================
     Digit fields (CPF + Ano de nascimento)
     =================================================================== */
  var fields = {
    cpf: { length: 4, values: [], boxes: [].slice.call(document.querySelectorAll('#cpf-row .digit-box')) },
    ano: { length: 4, values: [], boxes: [].slice.call(document.querySelectorAll('#ano-row .digit-box')) }
  };
  var fieldOrder = ['cpf', 'ano'];
  var activeField = 'cpf';

  var errorEl = document.getElementById('search-error');
  var submitBtn = document.getElementById('submit-search');

  function renderField(name) {
    var field = fields[name];
    field.boxes.forEach(function (box, i) {
      var digitEl = box.querySelector('.digit');
      var hasValue = i < field.values.length;
      digitEl.textContent = hasValue ? field.values[i] : '–';
      box.setAttribute('data-filled', hasValue ? 'true' : 'false');
      box.setAttribute('data-active', (name === activeField && i === field.values.length) ? 'true' : 'false');
    });
  }

  function renderAll() {
    fieldOrder.forEach(renderField);
  }

  function isFieldComplete(name) {
    return fields[name].values.length === fields[name].length;
  }

  function isFormComplete() {
    return fieldOrder.every(isFieldComplete);
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function pressDigit(digit) {
    clearError();
    var field = fields[activeField];
    if (field.values.length >= field.length) return;
    field.values.push(digit);

    // Auto-advance to the next field once this one is full.
    if (field.values.length === field.length) {
      var idx = fieldOrder.indexOf(activeField);
      if (idx < fieldOrder.length - 1) {
        activeField = fieldOrder[idx + 1];
      }
    }
    renderAll();
  }

  function pressBack() {
    clearError();
    var field = fields[activeField];
    if (field.values.length > 0) {
      field.values.pop();
    } else {
      var idx = fieldOrder.indexOf(activeField);
      if (idx > 0) {
        activeField = fieldOrder[idx - 1];
        fields[activeField].values.pop();
      }
    }
    renderAll();
  }

  // Certificado atualmente exibido na tela de resultado (usado ao montar
  // o e-mail: nome, curso e data entram nas variáveis do template).
  var currentRecord = null;

  function handleSubmit() {
    if (!isFormComplete()) {
      errorEl.textContent = 'Preencha o CPF e o ano de nascimento completos.';
      errorEl.hidden = false;
      return;
    }
    clearError();

    var cpf4 = fields.cpf.values.join('');
    var ano = fields.ano.values.join('');
    var record = lookupCertificado(cpf4, ano);

    if (!record) {
      errorEl.textContent = 'Certificado não localizado, em caso de dúvida consultar o R.H.';
      errorEl.hidden = false;
      return;
    }

    currentRecord = record;
    document.getElementById('result-nome').textContent = record.nome;
    document.getElementById('result-curso').textContent = record.curso;
    document.getElementById('result-data').textContent = record.dataConclusao;
    preencherCertificado(record);
    showScreen('result');
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /* Preenche nome/curso/data por cima da arte do certificado (Slide2). */
  function preencherCertificado(record) {
    document.getElementById('cert-nome').textContent = record.nome;
    var cargaTexto = record.cargaHoraria ? ', com carga horária de <b>' + escapeHtml(record.cargaHoraria) + '</b>,' : '';
    document.getElementById('cert-paragrafo').innerHTML =
      'Por participar e concluir com aproveitamento o <b>' + escapeHtml(record.curso) + '</b>' + cargaTexto + ' ' +
      'concedido pela Empresa ADS LABORATÓRIO NUTRICIONAL LTDA. Realizado em ' + escapeHtml(record.dataConclusao) + '.' +
      '<span class="cert-local-data">Matão, ' + escapeHtml(record.dataConclusao) + '.</span>';
  }

  document.getElementById('keypad').addEventListener('click', function (e) {
    var btn = e.target.closest('.key');
    if (!btn) return;
    var key = btn.getAttribute('data-key');
    if (key === 'back') {
      pressBack();
    } else if (key === 'clear') {
      resetSearch();
    } else {
      pressDigit(key);
    }
  });

  submitBtn.addEventListener('click', handleSubmit);

  function resetSearch() {
    fields.cpf.values = [];
    fields.ano.values = [];
    activeField = 'cpf';
    clearError();
    renderAll();
  }

  /* ===================================================================
     Geração do PDF do certificado (imagem + nome/curso/data já
     preenchidos na tela) usando html2canvas + jsPDF, 100% no navegador.
     =================================================================== */

  // Orçamento de tamanho do PDF final (em caracteres base64). Nosso
  // próprio servidor aceita até ~4.000.000 chars (server/index.js) —
  // mantemos uma folga generosa aqui, só para não gerar PDFs enormes
  // à toa (e-mail mais rápido de enviar e de a pessoa receber).
  var PDF_BASE64_BUDGET = 1500000;

  // Tenta várias qualidades de JPEG (e, se preciso, reduz a resolução)
  // até o PDF final caber no orçamento de tamanho.
  function canvasToPdfBase64WithinBudget(canvas) {
    var qualities = [0.85, 0.7, 0.55, 0.4, 0.3];
    var workingCanvas = canvas;
    var attempts = 0;

    function buildPdf(cv, quality) {
      var imgData = cv.toDataURL('image/jpeg', quality);
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({
        orientation: cv.width >= cv.height ? 'landscape' : 'portrait',
        unit: 'px',
        format: [cv.width, cv.height]
      });
      pdf.addImage(imgData, 'JPEG', 0, 0, cv.width, cv.height);
      var datauri = pdf.output('datauristring');
      return datauri.substring(datauri.indexOf('base64,') + 'base64,'.length);
    }

    function downscale(cv, factor) {
      var out = document.createElement('canvas');
      out.width = Math.round(cv.width * factor);
      out.height = Math.round(cv.height * factor);
      out.getContext('2d').drawImage(cv, 0, 0, out.width, out.height);
      return out;
    }

    while (attempts < 3) {
      for (var i = 0; i < qualities.length; i++) {
        var base64 = buildPdf(workingCanvas, qualities[i]);
        if (base64.length <= PDF_BASE64_BUDGET) {
          return base64;
        }
      }
      // Nenhuma qualidade coube — reduz a resolução e tenta de novo.
      workingCanvas = downscale(workingCanvas, 0.75);
      attempts++;
    }

    // Último recurso: devolve o menor resultado obtido, mesmo acima do
    // orçamento (o envio pode falhar, mas ao menos tentamos).
    console.warn('Não foi possível comprimir o PDF do certificado dentro do orçamento de tamanho.');
    return buildPdf(workingCanvas, qualities[qualities.length - 1]);
  }

  function gerarPdfCertificadoBase64() {
    var el = document.querySelector('.certificate-preview');
    return document.fonts.ready.then(function () {
      return html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#000000',
        onclone: function (clonedDoc) {
          // A stage inteira usa "transform: scale(...)" para caber na
          // janela do totem; zeramos isso só no clone renderizado pelo
          // html2canvas para capturar o certificado no tamanho real.
          var clonedStage = clonedDoc.getElementById('stage');
          if (clonedStage) clonedStage.style.transform = 'none';

          // Em telas de celular o frame do certificado fica fluido/menor
          // e a pré-visualização é encolhida via --cert-scale — no clone
          // usado só para a captura, forçamos ambos de volta ao tamanho
          // nativo (937.6x662.67) para o PDF sair sempre no mesmo
          // tamanho/qualidade, independente do dispositivo.
          var clonedFrame = clonedDoc.querySelector('.certificate-frame');
          if (clonedFrame) {
            clonedFrame.style.width = '937.6px';
            clonedFrame.style.height = '662.67px';
            clonedFrame.style.overflow = 'visible';
          }
          var clonedPreview = clonedDoc.querySelector('.certificate-preview');
          if (clonedPreview) clonedPreview.style.transform = 'none';
        }
      });
    }).then(function (canvas) {
      return canvasToPdfBase64WithinBudget(canvas);
    });
  }

  /* ===================================================================
     Result screen actions — envio do certificado por e-mail
     (POST para o nosso próprio backend — ver server/README.md)
     =================================================================== */
  var emailInput = document.getElementById('email-input');
  var sendBtn = document.getElementById('send-button');
  var sendErrorEl = document.getElementById('send-error');

  /* ===================================================================
     Teclado virtual do e-mail — o totem roda em touchscreen sem teclado
     físico, então em vez de depender do teclado do SO (que nem sempre
     abre sozinho num navegador em modo kiosk), desenhamos o nosso
     próprio, no mesmo espírito do teclado numérico da tela de busca.
     =================================================================== */
  var keyboardOverlay = document.getElementById('email-keyboard');
  var keyboardBackdrop = document.getElementById('keyboard-backdrop');
  var keyboardPreview = document.getElementById('keyboard-preview');
  var keyboardPanel = keyboardOverlay ? keyboardOverlay.querySelector('.keyboard-panel') : null;

  function updateKeyboardPreview() {
    keyboardPreview.textContent = emailInput.value || emailInput.placeholder;
  }

  function openKeyboard() {
    updateKeyboardPreview();
    keyboardOverlay.hidden = false;
  }

  function closeKeyboard() {
    keyboardOverlay.hidden = true;
  }

  if (keyboardOverlay && keyboardPanel) {
    emailInput.addEventListener('focus', openKeyboard);
    keyboardBackdrop.addEventListener('click', closeKeyboard);

    keyboardPanel.addEventListener('click', function (e) {
      var key = e.target.closest('.kb-key');
      if (!key) return;
      clearSendError();

      var action = key.getAttribute('data-action');
      if (action === 'backspace') {
        emailInput.value = emailInput.value.slice(0, -1);
      } else if (action === 'space') {
        emailInput.value += ' ';
      } else if (action === 'done') {
        closeKeyboard();
        return;
      } else {
        var char = key.getAttribute('data-char');
        if (char) emailInput.value += char;
      }
      updateKeyboardPreview();
    });
  }

  var apiConfig = window.TOTEM_API_CONFIG || null;
  var apiReady = !!(apiConfig && apiConfig.baseUrl &&
    apiConfig.baseUrl.indexOf('COLE_AQUI') !== 0);

  if (!apiReady) {
    console.warn('Servidor de envio não configurado — preencha server-config.js (veja server/README.md). O botão ENVIAR vai gerar o PDF mas não vai enviar.');
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }

  function showSendError(message) {
    sendErrorEl.textContent = message;
    sendErrorEl.hidden = false;
  }

  function clearSendError() {
    sendErrorEl.hidden = true;
    sendErrorEl.textContent = '';
  }

  function setSendBtnState(label, disabled, variant) {
    sendBtn.textContent = label;
    sendBtn.disabled = disabled;
    sendBtn.classList.toggle('is-loading', variant === 'loading');
    sendBtn.classList.toggle('is-success', variant === 'success');
  }

  function postCertificado(path, payload) {
    var url = apiConfig.baseUrl.replace(/\/+$/, '') + path;
    return fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Totem-Key': apiConfig.apiKey || ''
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (res.ok) return;
      return res.json().catch(function () { return {}; }).then(function (body) {
        throw new Error(body.error || ('Servidor respondeu ' + res.status));
      });
    });
  }

  function enviarCertificadoPorEmail(email, pdfBase64) {
    return postCertificado('/api/enviar-certificado', {
      email: email,
      nome: currentRecord.nome,
      curso: currentRecord.curso,
      dataConclusao: currentRecord.dataConclusao,
      cargaHoraria: currentRecord.cargaHoraria,
      pdfBase64: pdfBase64
    });
  }

  sendBtn.addEventListener('click', function () {
    clearSendError();

    var destino = emailInput.value.trim();
    if (!isValidEmail(destino)) {
      showSendError('Digite um e-mail válido.');
      emailInput.focus();
      return;
    }
    if (!currentRecord) {
      showSendError('Nenhum certificado carregado. Faça a busca novamente.');
      return;
    }

    var originalLabel = sendBtn.textContent;
    setSendBtnState('Gerando PDF…', true, 'loading');

    gerarPdfCertificadoBase64()
      .then(function (pdfBase64) {
        if (!apiReady) {
          throw { serverNotConfigured: true };
        }
        setSendBtnState('Enviando…', true, 'loading');
        return enviarCertificadoPorEmail(destino, pdfBase64);
      })
      .then(function () {
        setSendBtnState('Enviado!', true, 'success');
        setTimeout(function () {
          setSendBtnState(originalLabel, false);
          voltarParaBusca();
        }, 2500);
      })
      .catch(function (err) {
        if (err && err.serverNotConfigured) {
          showSendError('Envio ainda não configurado (veja server/README.md).');
        } else {
          console.error('Falha ao enviar certificado:', err);
          showSendError((err && err.message) || 'Não foi possível enviar. Tente novamente.');
        }
        setSendBtnState(originalLabel, false);
      });
  });

  // Volta para a tela inicial de busca (usada após um envio bem-sucedido e
  // também pelo botão "Nova Consulta").
  function voltarParaBusca() {
    emailInput.value = '';
    clearSendError();
    if (keyboardOverlay) closeKeyboard();
    currentRecord = null;
    resetSearch();
    showScreen('search');
  }

  document.getElementById('new-search-button').addEventListener('click', voltarParaBusca);

  renderAll();
})();
