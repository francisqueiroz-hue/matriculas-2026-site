-- Perguntas já anonimizadas, usadas só para agrupar dúvidas repetidas (aprendizado supervisionado).
CREATE TABLE perguntas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  texto_anon TEXT NOT NULL,
  resolvida INTEGER NOT NULL DEFAULT 0,
  criado_em INTEGER NOT NULL
);
CREATE INDEX idx_perguntas_criado ON perguntas (criado_em);
