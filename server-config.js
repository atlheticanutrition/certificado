/* ===================================================================
   Configuração do backend de envio do certificado (VPS próprio).

   Preencha os 2 valores abaixo depois de colocar o servidor no ar.
   Passo a passo completo em: server/README.md

   Enquanto "baseUrl" estiver com o valor de exemplo, o botão ENVIAR
   gera o PDF normalmente mas mostra um aviso em vez de enviar.
   =================================================================== */
window.TOTEM_API_CONFIG = {
  baseUrl: 'http://localhost:3001', // teste local — trocar pela URL do VPS antes de publicar
  apiKey: 'test-key-12345'
};
