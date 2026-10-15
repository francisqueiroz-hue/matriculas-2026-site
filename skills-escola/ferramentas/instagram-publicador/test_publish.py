import json, tempfile, os, unittest
from datetime import datetime, timezone, timedelta
import publish as p

PASSADO = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
FUTURO = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()


def item(**kw):
    base = dict(id="x", tipo="IMAGE", data_hora=PASSADO, legenda="oi", midia="https://a.com/i.jpg",
                status="aprovado", aprovado_por="Gestora")
    base.update(kw)
    return base


class Fake:
    def __init__(self):
        self.calls = []
    def __call__(self, metodo, url, params=None):
        self.calls.append((metodo, url, params))
        if url.endswith("content_publishing_limit"):
            return {"data": [{"quota_usage": 1, "config": {"quota_total": 25}}]}
        if url.endswith("media_publish"):
            return {"id": "PUB1"}
        if metodo == "GET":
            return {"status_code": "FINISHED"}
        return {"id": f"C{len(self.calls)}"}


class T(unittest.TestCase):
    def test_nao_publica_rascunho_nem_futuro_nem_sem_aprovador(self):
        agora = datetime.now(timezone.utc)
        self.assertFalse(p.devido(item(status="rascunho"), agora))
        self.assertFalse(p.devido(item(data_hora=FUTURO), agora))
        self.assertFalse(p.devido(item(aprovado_por=None), agora))
        self.assertTrue(p.devido(item(), agora))

    def test_validacao(self):
        self.assertEqual(p.validar(item()), [])
        self.assertTrue(p.validar(item(midia="http://a.com/i.jpg")))
        self.assertTrue(p.validar(item(tipo="CAROUSEL", midia=["https://a/1.jpg"])))
        self.assertTrue(p.validar(item(legenda="x" * 2201)))
        self.assertTrue(p.validar(item(tipo="FOO")))

    def test_fluxo_reels(self):
        f = Fake()
        cfg = dict(user_id="U", token="T", versao="v0")
        mid = p.publicar(item(tipo="REELS", midia="https://a.com/v.mp4"), cfg, f, lambda s: None)
        self.assertEqual(mid, "PUB1")
        criar = f.calls[0][2]
        self.assertEqual(criar["media_type"], "REELS")
        self.assertEqual(criar["video_url"], "https://a.com/v.mp4")

    def test_story_sem_legenda(self):
        self.assertNotIn("caption", p.montar_container(item(tipo="STORIES")))

    def test_carrossel(self):
        f = Fake()
        cfg = dict(user_id="U", token="T", versao="v0")
        p.publicar(item(tipo="CAROUSEL", midia=["https://a/1.jpg", "https://a/2.jpg"]), cfg, f, lambda s: None)
        posts = [c for c in f.calls if c[0] == "POST" and c[1].endswith("/media")]
        self.assertEqual(len(posts), 3)
        self.assertEqual(posts[-1][2]["media_type"], "CAROUSEL")

    def test_main_marca_publicado_e_para_no_erro(self):
        with tempfile.TemporaryDirectory() as d:
            arq = os.path.join(d, "f.json")
            json.dump([item(id="a"), item(id="b")], open(arq, "w"))
            os.environ.update(IG_USER_ID="U", IG_ACCESS_TOKEN="T", IG_GRAPH_VERSION="v0")
            p.main([arq], chamar=Fake())
            fila = json.load(open(arq))
            self.assertEqual([i["status"] for i in fila], ["publicado", "publicado"])

    def test_dry_run_nao_altera_arquivo(self):
        with tempfile.TemporaryDirectory() as d:
            arq = os.path.join(d, "f.json")
            json.dump([item()], open(arq, "w"))
            antes = open(arq).read()
            p.main([arq, "--dry-run"])
            self.assertEqual(antes, open(arq).read())

if __name__ == "__main__":
    unittest.main()
