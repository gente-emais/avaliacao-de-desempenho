// Quadro "Como funciona": resumo + passo a passo numerado (quem faz cada etapa)
export type Passo = { titulo: string; quem: string; texto: string }
export type Explicacao = { resumo: string; passos: Passo[]; ondeVer?: string }

export default function ComoFunciona({ titulo, explicacao, aberto }: { titulo: string; explicacao: Explicacao; aberto: boolean }) {
  const e = explicacao
  return (
    <details className="card como-funciona" open={aberto}>
      <summary><strong>Como funciona: {titulo}</strong><span className="muted"> · passo a passo</span></summary>
      <p style={{ margin: 0 }}>{e.resumo}</p>
      <ol className="passos">
        {e.passos.map((p, i) => (
          <li key={i}>
            <span className="passo-num">{i + 1}</span>
            <div><strong>{p.titulo}</strong> <span className="passo-quem">{p.quem}</span><div className="muted">{p.texto}</div></div>
          </li>
        ))}
      </ol>
      {e.ondeVer && <p className="muted" style={{ margin: 0 }}>{e.ondeVer}</p>}
    </details>
  )
}
