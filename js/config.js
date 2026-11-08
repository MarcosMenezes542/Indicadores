// Configuração pública do app (chave "publishable" do Supabase — pode ficar no navegador;
// a segurança é garantida pelas regras de acesso (RLS) do banco).
window.VMO_CONFIG = {
  SUPABASE_URL: "https://llzyklckdbhiyaupyzpo.supabase.co",
  SUPABASE_KEY: "sb_publishable_9nsbsiwdZDPuXfGphk9J9A_hnrAkyxM",
  DOMINIO: "vigilancia.local", // logins sem "@" viram login@vigilancia.local
  BUCKET: "fotos",
  CATEGORIAS: [
    "Sinais de invasão / arrombamento",
    "Cerca / perímetro danificado",
    "Portão / cadeado danificado",
    "Iluminação deficiente",
    "Câmera / CFTV inoperante",
    "Alarme disparado / inoperante",
    "Furto de cabos / materiais",
    "Vandalismo / pichação",
    "Pessoa ou veículo suspeito",
    "Vegetação alta / limpeza",
    "Animais na área",
    "Incêndio / fumaça",
    "Vazamento / óleo",
    "Outros",
  ],
  GRAVIDADES: ["Baixa", "Média", "Alta", "Crítica"],
};
