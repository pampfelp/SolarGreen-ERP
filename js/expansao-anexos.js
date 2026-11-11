(function () {
  'use strict';

  const limite = 10 * 1024 * 1024;

  async function pedir(acao, dados) {
    const usuario = window.firebase.auth().currentUser;
    if (!usuario) throw new Error('Entre no ERP para acessar os anexos.');
    const idToken = await usuario.getIdToken();
    const resposta = await window.SGAuth.apiCallOficial(acao, { ...dados, idToken });
    if (!resposta?.ok) throw new Error(resposta?.erro || 'O Drive não respondeu.');
    return resposta;
  }

  function base64DoArquivo(arquivo) {
    return new Promise((resolve, reject) => {
      const leitor = new FileReader();
      leitor.onload = () => resolve(String(leitor.result).split(',')[1]);
      leitor.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'));
      leitor.readAsDataURL(arquivo);
    });
  }

  async function enviar(idCliente, tipo, arquivo) {
    const mime = arquivo?.type;
    const aceito = mime === 'application/pdf'
      || (tipo === 'Documento' && ['image/jpeg', 'image/png'].includes(mime));
    if (!idCliente) throw new Error('Salve o cliente antes de enviar o anexo.');
    if (!aceito || !arquivo.size || arquivo.size > limite) {
      throw new Error(tipo === 'Fatura'
        ? 'Selecione uma fatura PDF de até 10 MB.'
        : 'Selecione um PDF, JPG ou PNG de até 10 MB.');
    }
    const base64 = await base64DoArquivo(arquivo);
    const { anexo } = await pedir('uploadAnexoExpansao', { idCliente, tipo, nome: arquivo.name, mime, base64 });
    return anexo;
  }

  async function baixar(idProposta, tipo) {
    const { base64, mime } = await pedir('baixarAnexoExpansao', { idProposta, tipo });
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, c => c.charCodeAt(0));
    return new Blob([bytes], { type: mime });
  }

  window.SGExpansaoAnexos = { enviar, baixar };
})();

