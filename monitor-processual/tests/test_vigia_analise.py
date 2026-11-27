"""
Testes de core/vigia_analise.py (gatilhos, validação e registro da análise AJEAP
e das minutas). Só dados FICTÍCIOS: o repositório é público.
"""
import copy
import os
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest  # noqa: E402

from core import vigia_analise as va  # noqa: E402

HOJE = date(2026, 10, 14)
AGORA = datetime(2026, 10, 14, 8, 30, 0)


def ajeap_ok(**extra):
    base = {
        "resumoCaso": "Ação fictícia de cobrança; réu citado.",
        "baseLegal": ["CPC, art. 335 (prazo de contestação)"],
        "pontosFortes": ["Contrato escrito"],
        "pontosFracos": ["Prova do pagamento incompleta"],
        "cenarios": {"favoravel": "Improcedência.", "provavel": "Procedência parcial.", "desfavoravel": "Procedência total."},
        "vetorTemporal": "Postergar a execução e acelerar o mérito.",
        "estrategiaRecomendada": "Contestar e propor acordo.",
        "planoAcao": [{"passo": "Protocolar contestação", "prazo": "até 30/10/2026"}],
        "fontes": ["CPC (Planalto)"],
        "ressalvaProfissional": "Análise consultiva; exige validação por advogado(a) com registro ativo na OAB.",
    }
    base.update(extra)
    return base


def doc(**extra):
    d = {
        "id": "cnj_00000000000000000001", "numero": "0000001-00.2020.8.19.0001", "tribunal": "1ª Vara (TJRJ)",
        "autor": "Autora Fictícia", "reu": "Réu Fictício", "tipo": "Cível", "faseProvavel": "Instrução",
        "ultimaMovData": "2026-10-01", "ultimaMovResumo": "Juntada de petição", "eventos": [{"data": "01/10/2026", "texto": "Juntada"}],
        "ajeap": ajeap_ok(), "ajeapAtualizadoEm": "2026-10-05T08:00:00",
    }
    d.update(extra)
    return d


# ------------------------------------------------------------------ gatilhos
def test_sem_motivo_nao_analisa():
    assert va.motivos_para_analisar(doc(), None, hoje=HOJE) == []


def test_sem_ajeap():
    assert va.motivos_para_analisar(doc(ajeap=None, ajeapAtualizadoEm=None), None, hoje=HOJE) == ["sem_ajeap"]


def test_movimento_posterior_a_analise():
    d = doc(ultimaMovData="2026-10-10")
    assert va.motivos_para_analisar(d, None, hoje=HOJE) == ["movimento_posterior_a_analise"]
    # andamento do DataJud também conta
    d2 = doc(datajud={"ultimoAndamento": "2026-10-12"})
    assert va.motivos_para_analisar(d2, None, hoje=HOJE) == ["movimento_posterior_a_analise"]
    # movimento no mesmo dia da análise não dispara
    assert va.motivos_para_analisar(doc(ultimaMovData="2026-10-05"), None, hoje=HOJE) == []


def test_documento_legado_sem_data_de_analise_nao_dispara_por_movimento():
    d = doc(ajeapAtualizadoEm=None, ultimaMovData="2026-10-13")
    assert va.motivos_para_analisar(d, None, hoje=HOJE) == []


def test_novidade_no_retrato_so_se_o_retrato_for_posterior_a_analise():
    r = {"novidade": True, "verificado_em": "2026-10-13T07:09:59"}
    assert va.motivos_para_analisar(doc(), r, hoje=HOJE) == ["novidade_no_retrato"]
    antigo = {"novidade": True, "verificado_em": "2026-10-04T07:00:00"}
    assert va.motivos_para_analisar(doc(), antigo, hoje=HOJE) == []
    assert va.motivos_para_analisar(doc(), {"novidade": False, "verificado_em": "2026-10-13"}, hoje=HOJE) == []


def test_termo_sensivel_so_junto_com_novidade():
    r = {"novidade": True, "verificado_em": "2026-10-13", "termos_sensiveis": ["Decurso de Prazo"]}
    assert va.motivos_para_analisar(doc(), r, hoje=HOJE) == ["novidade_no_retrato", "termo_sensivel_novo"]
    sem = {"novidade": False, "verificado_em": "2026-10-13", "termos_sensiveis": ["Decurso de Prazo"]}
    assert va.motivos_para_analisar(doc(), sem, hoje=HOJE) == []


def test_prazo_em_risco_sem_analise_que_o_cubra():
    d = doc(prazo={"dataLimite": "2026-10-17", "dataPublicacao": "2026-10-13"})
    # análise de 05/10 é anterior à publicação do prazo (13/10): não cobre
    assert "prazo_em_risco" in va.motivos_para_analisar(d, None, hoje=HOJE)
    # análise feita depois da publicação e há menos de 5 dias: cobre
    ok = doc(prazo={"dataLimite": "2026-10-17", "dataPublicacao": "2026-10-13"}, ajeapAtualizadoEm="2026-10-13T10:00:00")
    assert va.motivos_para_analisar(ok, None, hoje=HOJE) == []
    # prazo distante (> 5 dias) não é "em risco"
    longe = doc(prazo={"dataLimite": "2026-11-20", "dataPublicacao": "2026-10-13"})
    assert "prazo_em_risco" not in va.motivos_para_analisar(longe, None, hoje=HOJE)
    # prazo vencido não é "em risco" (é outro assunto)
    vencido = doc(prazo={"dataLimite": "2026-10-10", "dataPublicacao": "2026-10-01"})
    assert "prazo_em_risco" not in va.motivos_para_analisar(vencido, None, hoje=HOJE)


def test_prazo_do_retrato_do_monitor_tambem_conta():
    r = {"prazos_abertos": [{"data_limite": "2026-10-16", "data_publicacao": "2026-10-13"}]}
    assert va.motivos_para_analisar(doc(), r, hoje=HOJE) == ["prazo_em_risco"]


def test_analise_antiga_com_prazo_aberto():
    antiga = {"ajeapAtualizadoEm": "2026-08-01T08:00:00", "ultimaMovData": "2026-07-15"}  # sem andamento depois da análise
    d = doc(prazo={"dataLimite": "2026-12-01", "dataPublicacao": "2026-07-20"}, **antiga)
    assert va.motivos_para_analisar(d, None, hoje=HOJE) == ["analise_antiga_com_prazo_aberto"]
    assert va.motivos_para_analisar(doc(**antiga), None, hoje=HOJE) == []  # análise antiga, mas sem prazo aberto
    # andamento posterior à análise antiga também entra
    mov = doc(prazo={"dataLimite": "2026-12-01", "dataPublicacao": "2026-07-20"}, ajeapAtualizadoEm="2026-08-01T08:00:00")
    assert va.motivos_para_analisar(mov, None, hoje=HOJE) == ["movimento_posterior_a_analise", "analise_antiga_com_prazo_aberto"]


def test_motivos_saem_em_ordem_de_prioridade():
    d = doc(ajeap=None, ajeapAtualizadoEm=None, prazo={"dataLimite": "2026-10-16", "dataPublicacao": "2026-10-13"})
    r = {"novidade": True, "verificado_em": "2026-10-13", "termos_sensiveis": ["Intimação"]}
    assert va.motivos_para_analisar(d, r, hoje=HOJE) == ["prazo_em_risco", "sem_ajeap", "novidade_no_retrato", "termo_sensivel_novo"]


# ------------------------------------------------------------------ fila
def test_fila_ordena_pelo_prazo_mais_proximo_e_respeita_o_limite():
    docs = [
        doc(id="a", numero="N-A", ajeap=None, ajeapAtualizadoEm=None),                       # sem prazo
        doc(id="b", numero="N-B", ajeap=None, ajeapAtualizadoEm=None, prazo={"dataLimite": "2026-10-20"}),
        doc(id="c", numero="N-C", ajeap=None, ajeapAtualizadoEm=None, prazo={"dataLimite": "2026-10-15"}),
        doc(id="d", numero="N-D"),                                                           # nada a fazer
    ]
    fila = va.fila_de_analise(docs, hoje=HOJE)
    assert [f["id"] for f in fila] == ["c", "b", "a"]
    assert fila[0]["dias_ate_prazo"] == 1 and fila[2]["dias_ate_prazo"] is None
    assert [f["id"] for f in va.fila_de_analise(docs, hoje=HOJE, limite=2)] == ["c", "b"]


def test_fila_desempata_pela_prioridade_do_motivo_e_depois_pelo_numero():
    docs = [
        doc(id="mov", numero="N-0", ultimaMovData="2026-10-10"),                              # movimento_posterior_a_analise
        doc(id="sem2", numero="N-2", ajeap=None, ajeapAtualizadoEm=None),                    # sem_ajeap
        doc(id="sem1", numero="N-1", ajeap=None, ajeapAtualizadoEm=None),                    # sem_ajeap
    ]
    assert [f["id"] for f in va.fila_de_analise(docs, hoje=HOJE)] == ["sem1", "sem2", "mov"]


def test_fila_usa_o_retrato_pelo_numero():
    docs = [doc(id="a", numero="N-A")]
    r = {"N-A": {"novidade": True, "verificado_em": "2026-10-13"}}
    assert va.fila_de_analise(docs, r, hoje=HOJE)[0]["motivos"] == ["novidade_no_retrato"]


# ------------------------------------------------------------------ validação da análise
def test_ajeap_valido_passa():
    assert va.validar_ajeap(ajeap_ok()) == []


def test_ajeap_exige_os_tres_cenarios():
    a = ajeap_ok()
    del a["cenarios"]["desfavoravel"]
    assert any("desfavoravel" in e for e in va.validar_ajeap(a))
    b = ajeap_ok()
    del b["cenarios"]
    assert any("cenarios" in e for e in va.validar_ajeap(b))


def test_ajeap_exige_ressalva_com_oab():
    assert any("OAB" in e for e in va.validar_ajeap(ajeap_ok(ressalvaProfissional="Análise consultiva.")))
    assert any("OAB" in e for e in va.validar_ajeap(ajeap_ok(ressalvaProfissional="")))


def test_ajeap_com_precedente_exige_fontes():
    a = ajeap_ok(baseLegal=["Tema 1.234 do STJ"], fontes=[])
    assert any("fontes" in e for e in va.validar_ajeap(a))
    assert va.validar_ajeap(ajeap_ok(baseLegal=["Tema 1.234 do STJ"], fontes=["portal do STJ, consultado em 14/10/2026"])) == []


def test_ajeap_incompleta_so_com_perguntas_e_valida():
    a = {"resumoCaso": "Faltam fatos essenciais.", "perguntasNecessarias": ["Qual a data da citação?"],
         "ressalvaProfissional": "Exige validação por advogado(a) com OAB ativa."}
    assert va.validar_ajeap(a) == []


def test_ajeap_incompleta_sem_ressalva_e_invalida():
    a = {"resumoCaso": "x", "perguntasNecessarias": ["?"]}
    assert any("OAB" in e for e in va.validar_ajeap(a))


def test_plano_de_acao_exige_passo_e_prazo():
    a = ajeap_ok(planoAcao=[{"passo": "Fazer algo"}])
    assert any("planoAcao[1]" in e for e in va.validar_ajeap(a))
    assert any("planoAcao" in e for e in va.validar_ajeap(ajeap_ok(planoAcao=[])))


def test_ajeap_que_nao_e_objeto():
    assert va.validar_ajeap(None) == ["ajeap deve ser um objeto"]


# ------------------------------------------------------------------ gravação
def test_aplicar_analise_grava_data_gatilho_e_historico():
    d = doc(ajeapGatilho=["sem_ajeap"])
    nova = ajeap_ok(resumoCaso="Nova análise.")
    upd = va.aplicar_analise(d, nova, ["movimento_posterior_a_analise"], agora=AGORA)
    assert upd["ajeap"]["resumoCaso"] == "Nova análise."
    assert upd["ajeapAtualizadoEm"] == "2026-10-14T08:30:00"
    assert upd["ajeapGatilho"] == ["movimento_posterior_a_analise"]
    assert upd["ajeapHistorico"] == [{"em": "2026-10-05T08:00:00", "gatilhos": ["sem_ajeap"], "resumo": "Ação fictícia de cobrança; réu citado."}]


def test_historico_e_limitado_a_cinco():
    d = doc(ajeapHistorico=[{"em": f"2026-0{i}-01", "gatilhos": [], "resumo": "x"} for i in range(1, 6)])
    upd = va.aplicar_analise(d, ajeap_ok(), ["sem_ajeap"], agora=AGORA)
    assert len(upd["ajeapHistorico"]) == 5 and upd["ajeapHistorico"][-1]["resumo"].startswith("Ação fictícia")
    assert upd["ajeapHistorico"][0]["em"] == "2026-02-01"


def test_primeira_analise_nao_cria_historico():
    upd = va.aplicar_analise(doc(ajeap=None, ajeapAtualizadoEm=None), ajeap_ok(), ["sem_ajeap"], agora=AGORA)
    assert upd["ajeapHistorico"] == []


def test_aplicar_analise_invalida_levanta_e_nao_devolve_nada():
    d = doc()
    copia = copy.deepcopy(d)
    with pytest.raises(ValueError, match="análise AJEAP inválida"):
        va.aplicar_analise(d, ajeap_ok(ressalvaProfissional=""), ["sem_ajeap"], agora=AGORA)
    assert d == copia


# ------------------------------------------------------------------ minutas
LINK = "https://claude.ai/code/artifact/00000000-0000-0000-0000-000000000000"


def test_registrar_minuta_sempre_como_rascunho():
    upd = va.registrar_minuta(doc(), titulo="RASCUNHO — Contestação (cível fictício)", tipo="contestacao", link=LINK,
                              agora=AGORA, prazo_relacionado="2026-10-30")
    (m,) = upd["minutas"]
    assert m["status"] == "RASCUNHO" and m["geradoEm"] == "2026-10-14T08:30:00" and m["prazoRelacionado"] == "2026-10-30"


def test_minuta_com_texto_no_painel_quando_nao_ha_claude_docs():
    txt = "**RASCUNHO — NÃO PROTOCOLAR.** Exige conferência dos autos.\n\nCorpo [CONFIRMAR NOS AUTOS: vara]."
    upd = va.registrar_minuta(doc(), titulo="RASCUNHO — Contestação — X", tipo="contestacao",
                              link="https://claude.ai/artifact/CJkkzgBy5nuUwrhsCC3Cd6#minutas", agora=AGORA, texto=txt)
    assert upd["minutas"][0]["texto"] == txt and upd["minutas"][0]["status"] == "RASCUNHO"


def test_texto_da_minuta_exige_cabecalho_e_tem_limite():
    base = dict(titulo="RASCUNHO — Recurso — X", tipo="recurso", link=LINK, agora=AGORA)
    with pytest.raises(ValueError, match="cabeçalho"):
        va.registrar_minuta(doc(), texto="Peça pronta para protocolo.", **base)
    with pytest.raises(ValueError, match="excede"):
        va.registrar_minuta(doc(), texto="RASCUNHO — NÃO PROTOCOLAR. " + "x" * 31_000, **base)


def test_minuta_exige_titulo_rascunho_tipo_valido_e_link_https():
    for kw, trecho in (
        ({"titulo": "Contestação", "tipo": "contestacao", "link": LINK}, "RASCUNHO"),
        ({"titulo": "RASCUNHO x", "tipo": "protocolo", "link": LINK}, "tipo"),
        ({"titulo": "RASCUNHO x", "tipo": "recurso", "link": "http://x"}, "https"),
    ):
        with pytest.raises(ValueError, match=trecho):
            va.registrar_minuta(doc(), agora=AGORA, **kw)


def test_validar_minuta_recusa_status_diferente_de_rascunho():
    m = {"titulo": "RASCUNHO x", "tipo": "recurso", "link": LINK, "status": "PROTOCOLADO"}
    assert any("RASCUNHO" in e for e in va.validar_minuta(m))


def test_minuta_repetida_nao_duplica_e_a_lista_e_limitada():
    d = doc()
    d.update(va.registrar_minuta(d, titulo="RASCUNHO a", tipo="outro", link=LINK, agora=AGORA))
    d.update(va.registrar_minuta(d, titulo="RASCUNHO a", tipo="outro", link=LINK, agora=AGORA))
    assert len(d["minutas"]) == 1
    for i in range(25):
        d.update(va.registrar_minuta(d, titulo=f"RASCUNHO {i}", tipo="outro", link=f"{LINK}/{i}", agora=AGORA))
    assert len(d["minutas"]) == va.MAX_MINUTAS and d["minutas"][-1]["titulo"] == "RASCUNHO 24"


# ------------------------------------------------------------------ pacote
def test_pacote_minimiza_dados_e_trunca_textos():
    d = doc(eventos=[{"data": f"{i:02d}/10/2026", "texto": "t"} for i in range(1, 15)], cpfDoCliente="000.000.000-00")
    com = [{"data_disponibilizacao": "2026-10-13", "texto": "x" * 5000, "id": "interno-1"}]
    p = va.montar_pacote_analise(d, {"termos_sensiveis": ["Intimação"], "prazos_abertos": [{"data_limite": "2026-10-20"}]},
                                 com, motivos=["sem_ajeap"])
    assert len(p["eventosRecentes"]) == 8
    assert len(p["intimacoes"][0]["texto"]) == 1500 and set(p["intimacoes"][0]) == {"data", "texto"}
    assert "cpfDoCliente" not in str(p) and "interno-1" not in str(p)
    assert p["prazos"] == [{"dataLimite": "2026-10-20", "dataPublicacao": None}]
    assert p["motivosDaAnalise"] == ["sem_ajeap"] and p["analiseAnterior"]["resumoCaso"].startswith("Ação fictícia")


def test_datas_aceitam_formatos_do_painel_e_do_monitor():
    assert va._data("2026-10-14T08:30:00") == date(2026, 10, 14)
    assert va._data("14/10/2026") == date(2026, 10, 14)
    assert va._data(datetime(2026, 10, 14, 1)) == date(2026, 10, 14)
    assert va._data("lixo") is None and va._data(None) is None and va._data("") is None
