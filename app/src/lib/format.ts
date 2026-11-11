import type { Grupo, StatusAvaliacao, TipoRodada } from './supabase'

export const iniciais = (nome: string) =>
  nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('')

export const data = (d: string | null | undefined) =>
  d ? new Date(d.length === 10 ? d + 'T12:00:00' : d).toLocaleDateString('pt-BR') : '—'

export const dataHora = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

export const nota = (n: number | string | null | undefined) =>
  n === null || n === undefined ? '—' : Number(n).toFixed(2).replace('.', ',')

export const TIPO_RODADA: Record<TipoRodada, string> = {
  contratacao: 'Contratação de Desempenho',
  avaliativo: 'Ciclo Avaliativo',
  feedback: 'Ciclo de Feedback',
}

export const GRUPO: Record<Grupo, string> = {
  auto: 'Autoavaliação',
  gestor: 'Avaliação do gestor',
  lider: 'Avaliação do seu gestor',
  par: 'Avaliação de par',
}

export const STATUS: Record<StatusAvaliacao, { rotulo: string; classe: string }> = {
  pendente: { rotulo: 'Não iniciada', classe: 'pend' },
  em_andamento: { rotulo: 'Em andamento', classe: 'info' },
  enviada: { rotulo: 'Aguardando revisão', classe: 'roxo' },
  concluida: { rotulo: 'Concluída', classe: 'ok' },
  cancelada: { rotulo: 'Cancelada (movimentação)', classe: 'neutro' },
}

// Nome da tarefa conforme rodada e grupo
export function tituloTarefa(tipo: TipoRodada, grupo: Grupo, avaliado: string, souAvaliado: boolean) {
  if (tipo === 'contratacao') return `Contratação de ${avaliado}`
  if (tipo === 'feedback') return grupo === 'gestor' ? `Registrar feedback de ${avaliado}` : 'Responder ao feedback recebido'
  if (grupo === 'auto') return 'Sua autoavaliação e pré-work'
  if (grupo === 'lider') return `Avaliar seu gestor (${avaliado})`
  if (grupo === 'par') return `Avaliar seu par ${avaliado}`
  return souAvaliado ? 'Sua avaliação' : `Avaliar ${avaliado}`
}

export function baixarCsv(nome: string, linhas: (string | number | null | undefined)[][]) {
  const csv = linhas
    .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
    .join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  a.click()
  URL.revokeObjectURL(a.href)
}
