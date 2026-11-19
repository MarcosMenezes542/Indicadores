// =====================================================================
//  CONFIGURAÇÕES DO APLICATIVO
//  Este é o único arquivo que você precisa editar para personalizar.
// =====================================================================

export const CONFIG = {
  // Nome exibido no aplicativo
  nomeApp: 'Rota de Entregas',

  // Versão exibida em Ajustes
  versao: '1.2',

  // Chave PÚBLICA de ativação (gerada no arquivo ferramentas/gerador.html).
  // A chave pública pode ficar aqui sem problema: ela só CONFERE códigos,
  // não consegue criá-los. A chave PRIVADA fica só com você, no gerador.
  chavePublica: 'BJ37IDkRWN8EDcYAfqS0bmcHzt_n7kUsCH7Wrd33HKAXCpfqvz0s2qvMyOEacn3AbDAkCv7k2ux__TrZ8SOHPx0',

  // Deixe "true" enquanto estiver usando a chave de teste.
  // Ao trocar pela sua chave definitiva, mude para "false".
  chaveDeTeste: true,

  // Seu WhatsApp para o cliente pedir a ativação (só números, com DDI e DDD).
  // Exemplo: '5511999998888'. Deixe vazio para o cliente escolher o contato.
  whatsappVendedor: '',

  // Quantas entregas a pessoa pode ter na rota antes de ativar (modo teste).
  // Use 0 para bloquear totalmente o app até a ativação.
  limiteTeste: 3,
};
