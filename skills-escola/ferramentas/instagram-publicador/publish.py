#!/usr/bin/env python3
"""Publicador de fila do Instagram (Graph API) — só publica itens aprovados e no horário.

Credenciais por variáveis de ambiente (nunca em arquivo):
  IG_USER_ID, IG_ACCESS_TOKEN, IG_GRAPH_VERSION (ex.: v21.0 — confirme a versão vigente)

Uso:
  python3 publish.py fila.json --dry-run     # simula, não chama a API
  python3 publish.py fila.json               # publica itens aprovados com horário vencido
"""
import argparse
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

TIPOS = {"IMAGE", "CAROUSEL", "REELS", "STORIES"}
MAX_CAPTION = 2200


class ApiError(Exception):
    pass


def http(method, url, params=None):
    data = urllib.parse.urlencode(params).encode() if params and method == "POST" else None
    if params and method == "GET":
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, data=data, method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        raise ApiError(f"HTTP {e.code}: {e.read().decode()[:300]}")


def validar(item):
    """Retorna lista de problemas (vazia = ok). Não faz rede."""
    erros = []
    if item.get("tipo") not in TIPOS:
        erros.append("tipo inválido")
    if item.get("tipo") != "STORIES" and not (item.get("legenda") or "").strip():
        erros.append("legenda vazia")
    if len(item.get("legenda") or "") > MAX_CAPTION:
        erros.append("legenda acima de 2200 caracteres")
    midia = item.get("midia")
    if item.get("tipo") == "CAROUSEL":
        if not isinstance(midia, list) or not 2 <= len(midia) <= 10:
            erros.append("carrossel exige 2 a 10 mídias")
    elif not isinstance(midia, str) or not midia.startswith("https://"):
        erros.append("mídia precisa ser URL pública https")
    try:
        datetime.fromisoformat(item["data_hora"])
    except Exception:
        erros.append("data_hora inválida (ISO com fuso)")
    return erros


def devido(item, agora):
    dt = datetime.fromisoformat(item["data_hora"])
    if dt.tzinfo is None:
        raise ValueError("data_hora sem fuso horário")
    return item.get("status") == "aprovado" and bool(item.get("aprovado_por")) and dt <= agora


def e_video(url):
    return url.split("?")[0].lower().endswith((".mp4", ".mov"))


def montar_container(item):
    t = item["tipo"]
    p = {"caption": item.get("legenda", "")}
    if t == "IMAGE":
        p["image_url"] = item["midia"]
    elif t == "REELS":
        p.update(media_type="REELS", video_url=item["midia"])
    elif t == "STORIES":
        p["media_type"] = "STORIES"
        p["video_url" if e_video(item["midia"]) else "image_url"] = item["midia"]
        p.pop("caption")
    return p


def publicar(item, cfg, chamar=http, dormir=time.sleep):
    base = f"https://graph.facebook.com/{cfg['versao']}"
    uid = cfg["user_id"]
    tok = {"access_token": cfg["token"]}
    if item["tipo"] == "CAROUSEL":
        filhos = []
        for m in item["midia"]:
            q = dict(tok, is_carousel_item="true")
            q["video_url" if e_video(m) else "image_url"] = m
            if e_video(m):
                q["media_type"] = "VIDEO"
            filhos.append(chamar("POST", f"{base}/{uid}/media", q)["id"])
        for f in filhos:
            aguardar(f, base, tok, chamar, dormir)
        cont = chamar("POST", f"{base}/{uid}/media", dict(
            tok, media_type="CAROUSEL", children=",".join(filhos), caption=item["legenda"]))["id"]
    else:
        cont = chamar("POST", f"{base}/{uid}/media", dict(tok, **montar_container(item)))["id"]
    aguardar(cont, base, tok, chamar, dormir)
    return chamar("POST", f"{base}/{uid}/media_publish", dict(tok, creation_id=cont))["id"]


def aguardar(cid, base, tok, chamar, dormir, tentativas=30):
    for _ in range(tentativas):
        s = chamar("GET", f"{base}/{cid}", dict(tok, fields="status_code")).get("status_code")
        if s == "FINISHED":
            return
        if s in ("ERROR", "EXPIRED"):
            raise ApiError(f"contêiner {cid} em {s}")
        dormir(10)
    raise ApiError(f"contêiner {cid} não finalizou a tempo")


def cota_ok(cfg, chamar=http):
    base = f"https://graph.facebook.com/{cfg['versao']}"
    r = chamar("GET", f"{base}/{cfg['user_id']}/content_publishing_limit",
               {"access_token": cfg["token"], "fields": "quota_usage,config"})
    d = (r.get("data") or [{}])[0]
    usado, total = d.get("quota_usage", 0), (d.get("config") or {}).get("quota_total", 25)
    return usado < total, usado, total


def main(argv=None, chamar=http):
    ap = argparse.ArgumentParser()
    ap.add_argument("fila")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max", type=int, default=5, help="máximo de publicações por execução")
    a = ap.parse_args(argv)
    with open(a.fila, encoding="utf-8") as f:
        fila = json.load(f)
    agora = datetime.now(timezone.utc)
    cfg = {"user_id": os.environ.get("IG_USER_ID"), "token": os.environ.get("IG_ACCESS_TOKEN"),
           "versao": os.environ.get("IG_GRAPH_VERSION")}
    if not a.dry_run and not all(cfg.values()):
        print("Defina IG_USER_ID, IG_ACCESS_TOKEN e IG_GRAPH_VERSION.", file=sys.stderr)
        return 2
    feitos = 0
    for item in fila:
        if not devido(item, agora):
            continue
        erros = validar(item)
        if erros:
            item["status"], item["erro"] = "erro", "; ".join(erros)
            print(f"[{item['id']}] inválido: {item['erro']}")
            continue
        if a.dry_run:
            print(f"[{item['id']}] (simulação) publicaria {item['tipo']} de {item['data_hora']}")
            continue
        if feitos >= a.max:
            break
        try:
            ok, usado, total = cota_ok(cfg, chamar)
            if not ok:
                print(f"Cota diária esgotada ({usado}/{total}). Parando.")
                break
            item["media_id"] = publicar(item, cfg, chamar)
            item["status"] = "publicado"
            feitos += 1
            print(f"[{item['id']}] publicado: {item['media_id']}")
        except ApiError as e:
            item["status"], item["erro"] = "erro", str(e)
            print(f"[{item['id']}] ERRO: {e}")
            break  # pausa diante de erro
    if not a.dry_run:
        with open(a.fila, "w", encoding="utf-8") as f:
            json.dump(fila, f, ensure_ascii=False, indent=2)
    return 0


if __name__ == "__main__":
    sys.exit(main())
