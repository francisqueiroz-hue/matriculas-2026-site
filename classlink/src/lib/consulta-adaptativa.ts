"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Consulta periódica que se adapta ao uso: começa no intervalo base, vai espaçando (×fator) a
 * cada consulta sem novidade até o teto e volta ao base quando algo muda, quando a pessoa age
 * (enviar mensagem chama `reiniciar`) ou quando a aba volta a ficar visível. Com a aba oculta,
 * usa `ocultoMs` (ou para, se null); sem internet, não consulta.
 *
 * Objetivo: menos chamadas ao servidor (cota da Vercel Hobby e conexões do banco) sem atrasar
 * mensagens numa conversa ativa.
 */
export interface ConfigConsulta {
  baseMs: number;
  maxMs: number;
  /** Intervalo com a aba oculta; null = não consulta em segundo plano. */
  ocultoMs: number | null;
  fator?: number;
}

/** Próximo intervalo (função pura, testada): reinicia se mudou, senão espaça até o teto. */
export function proximoIntervalo(atualMs: number, mudou: boolean, cfg: ConfigConsulta): number {
  if (mudou) return cfg.baseMs;
  return Math.min(cfg.maxMs, Math.round(atualMs * (cfg.fator ?? 1.5)));
}

/**
 * `consultar` devolve true quando encontrou novidade. Retorna `reiniciar`, para chamar depois
 * de uma ação da pessoa (ex.: enviou mensagem), que consulta já e volta ao intervalo base.
 */
export function useConsultaAdaptativa(consultar: () => Promise<boolean>, cfg: ConfigConsulta): () => void {
  const consultarRef = useRef(consultar);
  const cfgRef = useRef(cfg);
  useEffect(() => {
    consultarRef.current = consultar;
    cfgRef.current = cfg;
  });
  const reiniciarRef = useRef<() => void>(() => {});

  useEffect(() => {
    let ativo = true;
    let rodando = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let intervalo = cfgRef.current.baseMs;

    function agendar() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (!ativo) return;
      const espera = document.visibilityState === "visible" ? intervalo : cfgRef.current.ocultoMs;
      if (espera === null) return; // aba oculta sem consulta em segundo plano: retoma ao voltar
      timer = setTimeout(() => void ciclo(), espera);
    }

    async function ciclo() {
      if (!ativo || rodando) return;
      if (navigator.onLine === false) {
        agendar(); // sem internet: o evento "online" antecipa a próxima
        return;
      }
      rodando = true;
      let mudou = false;
      try {
        mudou = await consultarRef.current();
      } catch {
        // falha de rede/sessão: segue no mesmo ritmo
      } finally {
        rodando = false;
      }
      intervalo = proximoIntervalo(intervalo, mudou, cfgRef.current);
      agendar();
    }

    function reiniciar() {
      intervalo = cfgRef.current.baseMs;
      void ciclo();
    }
    reiniciarRef.current = reiniciar;

    const aoMudarVisibilidade = () => (document.visibilityState === "visible" ? reiniciar() : agendar());
    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    window.addEventListener("online", reiniciar);
    void ciclo();
    return () => {
      ativo = false;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
      window.removeEventListener("online", reiniciar);
    };
  }, []);

  return useCallback(() => reiniciarRef.current(), []);
}
