// =====================================================================
//  CONFIGURAÇÕES DO APLICATIVO
//  Este é o único arquivo que você precisa editar para personalizar.
// =====================================================================

export const CONFIG = {
  // Nome exibido no aplicativo
  nomeApp: 'Palco',

  // Chave PÚBLICA de ativação (gerada no arquivo ferramentas/gerador.html).
  // A chave pública pode ficar aqui sem problema: ela só CONFERE códigos,
  // não consegue criá-los. A chave PRIVADA fica só com você, no gerador.
  chavePublica: 'BL9zxQY7Vy1xebLSz026BsIs7tElo52HABVaoeDqX9KpKA7NXmqCQcUzlDwl9TIzrR9edWVaDWKVFmNsyXjlswQ',

  // Deixe "true" enquanto estiver usando a chave de teste.
  // Ao trocar pela sua chave definitiva, mude para "false".
  chaveDeTeste: true,

  // Seu WhatsApp para o cliente pedir a ativação (só números, com DDI e DDD).
  // Exemplo: '5511999998888'. Deixe vazio para o cliente escolher o contato.
  whatsappVendedor: '',

  // Quantas músicas a pessoa pode cadastrar antes de ativar (modo teste).
  // Use 0 para bloquear totalmente o app até a ativação.
  limiteTeste: 3,
};
