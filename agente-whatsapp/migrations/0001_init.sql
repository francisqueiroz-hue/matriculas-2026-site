CREATE TABLE processadas (wamid TEXT PRIMARY KEY, em INTEGER NOT NULL);

CREATE TABLE contatos (
  telefone TEXT PRIMARY KEY,
  tipo TEXT NOT NULL DEFAULT 'interessado',
  nome TEXT,
  ultima_msg_em INTEGER
);

CREATE TABLE fatos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  texto TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  usado_em INTEGER NOT NULL
);
CREATE INDEX idx_fatos_telefone ON fatos (telefone);

CREATE TABLE base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  aprovado INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL DEFAULT 0
);
-- Mantida pelo código (rowid = base.id); sem gatilhos por causa do import de migrações do D1.
CREATE VIRTUAL TABLE base_fts USING fts5(pergunta, resposta, tokenize = 'unicode61 remove_diacritics 2');

CREATE TABLE visitas_horarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  data TEXT NOT NULL,
  turno TEXT NOT NULL,
  vagas INTEGER NOT NULL
);

CREATE TABLE visitas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  horario_id INTEGER NOT NULL,
  serie TEXT NOT NULL,
  criado_em INTEGER NOT NULL,
  UNIQUE (telefone, horario_id)
);

CREATE TABLE chamados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  categoria TEXT NOT NULL,
  prioridade TEXT NOT NULL,
  resumo TEXT NOT NULL,
  rascunho TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_em INTEGER NOT NULL
);

CREATE TABLE sugestoes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pergunta TEXT NOT NULL,
  resposta TEXT NOT NULL,
  frequencia INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pendente',
  criado_em INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE uso (chave TEXT PRIMARY KEY, valor INTEGER NOT NULL DEFAULT 0);

CREATE TABLE mensagens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telefone TEXT NOT NULL,
  direcao TEXT NOT NULL,
  texto TEXT NOT NULL,
  wamid TEXT,
  ts INTEGER NOT NULL
);
CREATE INDEX idx_mensagens_telefone ON mensagens (telefone, ts);

CREATE TABLE conversas (
  telefone TEXT PRIMARY KEY,
  humano_ate INTEGER NOT NULL DEFAULT 0,
  ultima_msg_em INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE assinaturas_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  chaves TEXT NOT NULL,
  criado_em INTEGER NOT NULL
);

CREATE TABLE config (chave TEXT PRIMARY KEY, valor TEXT NOT NULL);
