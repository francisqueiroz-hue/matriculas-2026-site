"""
Gatilho diário do Vigia: página local que, ao ser aberta no navegador, atualiza o dia.

Servidor HTTP mínimo, restrito a 127.0.0.1. Defina esta página como página inicial do
navegador: na primeira abertura do dia ela dispara, nesta ordem:

 1. importar   – traz do painel (arquivo do Drive) os processos que faltam na lista do monitor;
 2. coleta     – roda `run_daily.py` (DataJud, DJEN, e-mails), exceto se já rodou com sucesso hoje;
 3. fonte      – registra quando o próprio DataJud atualizou cada processo (`core.datajud_fonte`);
 4. exportar   – gera `data/retrato_vigia.json` a partir do banco do monitor;
 5. publicar   – copia o retrato para a pasta privada do Drive (a rotina Radar lê de lá).

Segurança (o servidor executa programas no computador, então é restrito):
* escuta só em 127.0.0.1; recusa pedidos cujo Host não seja local (anti DNS rebinding);
* o único comando externo é `python run_daily.py` (fixo); nada do navegador vira comando;
* `POST /executar` exige o cabeçalho `X-Vigia: 1` (um site externo não consegue enviá-lo);
* uma execução por vez; estado e erros curtos em `data/gatilho_status.json` (sem números de processo).

Uso:  python -m core.gatilho_diario --drive "G:\\Meu Drive\\Vigia Processual - Retrato" --lista <processos.json>
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Callable

PORTA_PADRAO = 8765
URL_PAINEL = "https://claude.ai/artifact/CJkkzgBy5nuUwrhsCC3Cd6"
TIMEOUT_COLETA_S = 3600


@dataclass
class Etapa:
    nome: str
    rotulo: str
    executar: Callable[[], str]          # devolve mensagem curta; levanta exceção em caso de falha
    critica: bool = False
    pular_se: Callable[[], str | None] = lambda: None   # devolve o motivo para pular, ou None


@dataclass
class Estado:
    estado: str = "ocioso"               # ocioso | executando | concluido | avisos | falhou
    data: str | None = None              # AAAA-MM-DD da última execução concluída
    inicio: str | None = None
    fim: str | None = None
    etapas: list = field(default_factory=list)


class Gatilho:
    def __init__(self, etapas: list[Etapa], arquivo_estado: Path, hoje: Callable[[], date] = date.today,
                 agora: Callable[[], datetime] = datetime.now):
        self.etapas, self.arquivo, self._hoje, self._agora = etapas, Path(arquivo_estado), hoje, agora
        self.estado = self._carregar()
        self._trava = threading.Lock()
        self._thread: threading.Thread | None = None

    # --- estado
    def _carregar(self) -> Estado:
        try:
            d = json.loads(self.arquivo.read_text(encoding="utf-8"))
            e = Estado(**{k: d.get(k) for k in ("estado", "data", "inicio", "fim")}, etapas=list(d.get("etapas") or []))
            if e.estado == "executando":      # processo anterior morreu no meio
                e.estado = "falhou"
            return e
        except (OSError, ValueError, TypeError):
            return Estado()

    def _salvar(self) -> None:
        try:
            self.arquivo.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.arquivo.with_suffix(".tmp")
            tmp.write_text(json.dumps(self.estado.__dict__, ensure_ascii=False, indent=2), encoding="utf-8")
            os.replace(tmp, self.arquivo)
        except OSError:
            pass

    def ja_executou_hoje(self) -> bool:
        return self.estado.data == self._hoje().isoformat() and self.estado.estado in ("concluido", "avisos")

    def status(self) -> dict:
        d = dict(self.estado.__dict__)
        d["executando"] = self.estado.estado == "executando"
        d["ja_executou_hoje"] = self.ja_executou_hoje()
        return d

    # --- execução
    def iniciar(self, forcar: bool = False) -> str:
        """'iniciado' | 'em_andamento' | 'ja_executado'. Nunca bloqueia: roda em segundo plano."""
        with self._trava:
            if self.estado.estado == "executando":
                return "em_andamento"
            if not forcar and self.ja_executou_hoje():
                return "ja_executado"
            self.estado = Estado(estado="executando", inicio=self._agora().replace(microsecond=0).isoformat(),
                                 etapas=[{"nome": e.nome, "rotulo": e.rotulo, "resultado": "aguardando", "mensagem": ""}
                                         for e in self.etapas])
            self._salvar()
            self._thread = threading.Thread(target=self._rodar, daemon=True)
            self._thread.start()
            return "iniciado"

    def aguardar(self, timeout: float = 30) -> None:
        if self._thread:
            self._thread.join(timeout)

    def _rodar(self) -> None:
        falha_critica = avisos = False
        for etapa, reg in zip(self.etapas, self.estado.etapas):
            if falha_critica:
                reg["resultado"], reg["mensagem"] = "pulado", "etapa anterior falhou"
                continue
            reg["resultado"] = "executando"
            self._salvar()
            try:
                motivo = etapa.pular_se()
                if motivo:
                    reg["resultado"], reg["mensagem"] = "pulado", motivo
                else:
                    reg["resultado"], reg["mensagem"] = "ok", (etapa.executar() or "")[:200]
            except Exception as e:                      # noqa: BLE001 - a falha vira estado, nunca derruba o servidor
                reg["resultado"], reg["mensagem"] = "falhou", f"{type(e).__name__}: {str(e)[:150]}"
                if etapa.critica:
                    falha_critica = True
                else:
                    avisos = True
        self.estado.fim = self._agora().replace(microsecond=0).isoformat()
        self.estado.data = self._hoje().isoformat()
        self.estado.estado = "falhou" if falha_critica else ("avisos" if avisos else "concluido")
        self._salvar()


# ---------------------------------------------------------------- etapas reais
def montar_etapas(base: Path, *, drive: Path | None, lista: Path | None, python: str = sys.executable) -> list[Etapa]:
    from core import exportador_vigia, importar_painel

    db = base / "data" / "monitor.db"
    retrato = base / "data" / "retrato_vigia.json"
    origem_numeros = (drive / "numeros_painel.json") if drive else None

    def importar() -> str:
        r = importar_painel.importar(origem_numeros, lista)
        return f"{r['incluidos']} incluído(s), {r['ja_na_lista']} já na lista"

    def pular_importar() -> str | None:
        if drive is None or lista is None:
            return "Drive ou lista não configurados"
        if not origem_numeros.is_file():
            return "arquivo do painel ainda não existe no Drive"
        return None

    def coleta_ja_feita() -> str | None:
        try:
            con = sqlite3.connect(f"file:{db.as_posix()}?mode=ro", uri=True)
            try:
                linha = con.execute("select 1 from execucoes where sucesso=1 and date(executado_em)=date('now','localtime') limit 1").fetchone()
            finally:
                con.close()
            return "já rodou com sucesso hoje" if linha else None
        except sqlite3.Error:
            return None

    def coleta() -> str:
        proc = subprocess.run([python, str(base / "run_daily.py")], cwd=str(base), capture_output=True,
                              text=True, timeout=TIMEOUT_COLETA_S)
        if proc.returncode != 0:
            raise RuntimeError(f"run_daily.py terminou com código {proc.returncode}")
        return "coleta concluída"

    def fonte_datajud() -> str:
        proc = subprocess.run([python, "-m", "core.datajud_fonte", "--db", str(db)], cwd=str(base),
                              capture_output=True, text=True, timeout=1800)
        if proc.returncode != 0:
            raise RuntimeError(f"datajud_fonte terminou com código {proc.returncode} (confira DATAJUD_API_KEY no .env)")
        return "data da fonte registrada"

    def exportar() -> str:
        r = exportador_vigia.exportar(db)
        exportador_vigia.gravar(r, retrato)
        return f"{len(r['processos'])} processo(s), {len(r['auditoria'])} aviso(s)"

    def pular_publicar() -> str | None:
        return None if drive is not None else "pasta do Drive não configurada"

    def publicar() -> str:
        tmp = drive / "retrato_vigia.json.tmp"
        shutil.copyfile(retrato, tmp)
        os.replace(tmp, drive / "retrato_vigia.json")
        return "retrato copiado para o Drive"

    return [
        Etapa("importar", "Trazer processos novos do painel", importar, False, pular_importar),
        Etapa("coleta", "Consultar DataJud, DJEN e e-mails", coleta, False, coleta_ja_feita),
        Etapa("fonte", "Registrar a atualização da fonte DataJud", fonte_datajud, False),
        Etapa("exportar", "Gerar o retrato do dia", exportar, True),
        Etapa("publicar", "Enviar o retrato ao Drive", publicar, True, pular_publicar),
    ]


# ---------------------------------------------------------------- HTTP
PAGINA = """<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Vigia Processual</title>
<style>
:root{--bg:#F6F3EE;--card:#fff;--ink:#211D1A;--soft:#5B5349;--line:#DDD4C4;--ok:#3F6B4A;--warn:#8A5A17;--bad:#A5333B;--accent:#7A2331;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#19160F;--card:#231F17;--ink:#F2ECE2;--soft:#C9BFAE;--line:#3C3527;--ok:#8FC49E;--warn:#E3B463;--bad:#E38A8A;--accent:#E28A92;color-scheme:dark}}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,sans-serif}
main{max-width:640px;margin:0 auto;padding:28px 16px 48px;display:flex;flex-direction:column;gap:18px}
h1{font:600 26px Georgia,serif;margin:0}.sub{color:var(--soft);margin:4px 0 0}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:6px 16px}
.row{display:flex;gap:12px;justify-content:space-between;align-items:baseline;padding:10px 0;border-top:1px solid var(--line)}
.row:first-child{border-top:0}.msg{color:var(--soft);font-size:13px}
.tag{font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.04em;white-space:nowrap}
.ok{color:var(--ok)}.falhou{color:var(--bad)}.pulado,.aguardando,.executando{color:var(--warn)}
.acoes{display:flex;gap:10px;flex-wrap:wrap}
a.btn,button{font:inherit;font-weight:600;padding:10px 16px;border-radius:10px;border:1px solid var(--line);background:var(--card);color:var(--ink);cursor:pointer;text-decoration:none}
a.btn.primary{background:var(--accent);color:var(--bg);border-color:var(--accent)}
</style></head><body><main>
<div><h1>Vigia Processual</h1><p class="sub" id="resumo">Verificando…</p></div>
<div class="card" id="etapas"></div>
<div class="acoes"><a class="btn primary" href="__URL__" target="_blank" rel="noopener">Abrir o painel</a>
<button id="forcar" type="button">Atualizar agora</button></div>
<p class="msg">Esta página só atualiza o computador local. Os dados de clientes não saem daqui, exceto o retrato enviado à sua pasta privada do Drive.</p>
</main><script>
const H={"X-Vigia":"1"};
function txt(s){return document.createTextNode(s)}
async function post(forcar){const r=await fetch("/executar",{method:"POST",headers:H,body:JSON.stringify({forcar})});return r.json()}
async function ler(){const r=await fetch("/status");return r.json()}
function pintar(s){
  const nomes={ocioso:"Aguardando.",executando:"Atualizando… não feche esta página.",concluido:"Atualização do dia concluída.",avisos:"Concluída com avisos.",falhou:"A atualização falhou."};
  document.getElementById("resumo").textContent=nomes[s.estado]||s.estado;
  const box=document.getElementById("etapas");box.replaceChildren();
  (s.etapas||[]).forEach(e=>{const r=document.createElement("div");r.className="row";
    const a=document.createElement("div");a.append(txt(e.rotulo));if(e.mensagem){const m=document.createElement("div");m.className="msg";m.textContent=e.mensagem;a.append(m)}
    const t=document.createElement("span");t.className="tag "+e.resultado;t.textContent=e.resultado;r.append(a,t);box.append(r)});
}
async function ciclo(){let s=await ler();pintar(s);if(s.executando)setTimeout(ciclo,2000)}
document.getElementById("forcar").onclick=async()=>{await post(true);ciclo()};
(async()=>{await post(false);ciclo()})();
</script></body></html>"""


def criar_servidor(gatilho: Gatilho, porta: int = PORTA_PADRAO) -> ThreadingHTTPServer:
    class H(BaseHTTPRequestHandler):
        server_version = "VigiaLocal"

        def log_message(self, *a):          # sem log de acessos
            pass

        def _host_ok(self) -> bool:
            host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]").lower()
            return host in ("127.0.0.1", "localhost")

        def _enviar(self, codigo: int, corpo: bytes, tipo: str) -> None:
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(corpo)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(corpo)

        def _json(self, codigo: int, obj) -> None:
            self._enviar(codigo, json.dumps(obj, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def do_GET(self):
            if not self._host_ok():
                return self._json(403, {"erro": "host não permitido"})
            if self.path in ("/", "/index.html"):
                return self._enviar(200, PAGINA.replace("__URL__", URL_PAINEL).encode("utf-8"), "text/html; charset=utf-8")
            if self.path == "/status":
                return self._json(200, gatilho.status())
            return self._json(404, {"erro": "não encontrado"})

        def do_POST(self):
            if not self._host_ok():
                return self._json(403, {"erro": "host não permitido"})
            if self.path != "/executar":
                return self._json(404, {"erro": "não encontrado"})
            if self.headers.get("X-Vigia") != "1":
                return self._json(403, {"erro": "cabeçalho ausente"})
            try:
                n = min(int(self.headers.get("Content-Length") or 0), 1024)
                forcar = bool(json.loads(self.rfile.read(n) or b"{}").get("forcar"))
            except (ValueError, AttributeError):
                forcar = False
            return self._json(200, {"resultado": gatilho.iniciar(forcar=forcar)})

    return ThreadingHTTPServer(("127.0.0.1", porta), H)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="Página local que atualiza o Vigia ao abrir o navegador.")
    ap.add_argument("--base", default=".", help="pasta do monitor (onde estão run_daily.py e data\\)")
    ap.add_argument("--drive", default="", help="pasta do Drive com numeros_painel.json / retrato_vigia.json")
    ap.add_argument("--lista", default=os.environ.get("VIGIA_PROCESSOS_JSON", ""), help="processos.json do monitor")
    ap.add_argument("--porta", type=int, default=PORTA_PADRAO)
    a = ap.parse_args(argv)
    base = Path(a.base).resolve()
    etapas = montar_etapas(base, drive=Path(a.drive) if a.drive else None, lista=Path(a.lista) if a.lista else None)
    gatilho = Gatilho(etapas, base / "data" / "gatilho_status.json")
    srv = criar_servidor(gatilho, a.porta)
    print(f"Vigia local em http://127.0.0.1:{a.porta}/  (Ctrl+C para encerrar)")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
