-- Reivindicação do atendimento por conversa (evita duas respostas em paralelo) e busca de eco por wamid.
ALTER TABLE conversas ADD COLUMN atendendo_ate INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_mensagens_wamid ON mensagens (wamid);
