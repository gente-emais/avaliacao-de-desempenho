import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

if (!url || !key) {
  // Mensagem clara para quem rodar sem o .env
  console.error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY no arquivo app/.env')
}

export const supabase = createClient(url, key)

// Colunas de pessoas liberadas para leitura (o CPF completo nunca sai pela API).
export const PESSOA_COLS =
  'id, cpf_mascarado, nome, email, email_ficticio, cargo, area, perfil_id, gestor_id, gestor_secundario_id, bp_id, papel, acesso_assistido, ativo, data_admissao'

export type Papel = 'admin_rh' | 'bp_rh' | 'participante'
export type Grupo = 'auto' | 'gestor' | 'lider' | 'par'
export type StatusAvaliacao = 'pendente' | 'em_andamento' | 'enviada' | 'concluida' | 'cancelada'
export type TipoRodada = 'contratacao' | 'avaliativo' | 'feedback'

export interface Pessoa {
  id: string
  cpf_mascarado: string
  nome: string
  email: string | null
  email_ficticio: boolean
  cargo: string | null
  area: string | null
  perfil_id: number | null
  gestor_id: string | null
  gestor_secundario_id: string | null
  bp_id: string | null
  papel: Papel
  acesso_assistido: boolean
  ativo: boolean
  data_admissao: string | null
}

export interface Rodada {
  id: string
  nome: string
  tipo: TipoRodada
  ano: number
  status: 'rascunho' | 'aberta' | 'encerrada' | 'historica'
  prazo_feedback: string | null
  foto_em: string | null
  resultado_liberado_em: string | null
  somente_leitura: boolean
}

export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data as T
}

// Nomes de pessoas por id (para mostrar o gestor sem embutir pessoas dentro de pessoas,
// o que o Supabase recusa por ser ambíguo: gestor e liderados usam a mesma chave).
export async function nomesPorId(ids: (string | null | undefined)[]): Promise<Record<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))] as string[]
  if (!unicos.length) return {}
  const { data } = await supabase.from('pessoas').select('id, nome').in('id', unicos)
  return Object.fromEntries(((data as { id: string; nome: string }[]) ?? []).map((p) => [p.id, p.nome]))
}
