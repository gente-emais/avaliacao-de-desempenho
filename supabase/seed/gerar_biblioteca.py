"""Gera a migração com a biblioteca de formulários (perguntas da Mindsight 2026, textos padronizados).

Uso: python3 supabase/seed/gerar_biblioteca.py > supabase/migrations/20261110172000_biblioteca.sql
"""

PERFIS = [
    # codigo, nome, nível de complexidade, acesso assistido
    ("operacional_obras", "Operacional Obras", 1, True),
    ("operacional_adm", "Operacional Adm", 2, False),
    ("vendas", "Vendas", 3, False),
    ("tatico", "Tático", 4, False),
    ("especialista", "Especialista", 4, False),
    ("lideranca", "Liderança", 4, False),
    ("estrategico_gerencia", "Estratégico Gerência", 4, False),
    ("estrategico_diretoria", "Estratégico Diretoria", 5, False),
]

COMPETENCIAS = [
    ("foco_cliente", "Foco no Cliente"),
    ("postura_dono", "Postura de Dono"),
    ("time_forte", "Time Forte"),
    ("obstinacao", "Obstinação por Resultados"),
    ("meritocracia", "Meritocracia"),
]

ESCALAS = {
    "competencia": ("Competência", ["A desenvolver", "Em desenvolvimento", "Desenvolvido", "Consolidado"]),
    "concordancia": ("Concordância", ["Estou seguro que não", "Na maioria das vezes, não",
                                      "Na maioria das vezes, sim", "Estou seguro que sim"]),
}

FAIXAS = [("A desenvolver", 0.00, 1.99), ("Em desenvolvimento", 2.00, 2.99),
          ("Desenvolvido", 3.00, 3.49), ("Consolidado", 3.50, 4.00)]

ESCOLARIDADE = ["Ensino médio cursando", "Ensino médio trancado", "Ensino médio concluído",
                "Ensino superior cursando", "Ensino superior trancado", "Ensino superior concluído",
                "Pós-graduação cursando", "Pós-graduação trancada", "Pós-graduação concluída"]
IDIOMA = ["Não se aplica", "Básico", "Intermediário", "Avançado", "Fluente"]
PRAZO = ["Está pronto", "Menos de 1 ano", "Entre 1 e 3 anos", "Entre 3 e 5 anos"]

# ---------- Perguntas de competência por nível (texto padronizado) ----------
ADM = {
    "foco_cliente": [
        "É proativo em identificar e sugerir novas soluções ou formas de fazer seu trabalho visando a melhoria contínua",
        "Conhece os clientes Emais e atua para atender suas necessidades",
        "Faz seu trabalho com qualidade colocando-se no lugar do cliente"],
    "postura_dono": [
        "Se interessa pelos assuntos relacionados à Emais e tem iniciativa para buscar informações sobre o mercado",
        "Entende a contribuição, o impacto das suas entregas no todo e trabalha trocando informações entre as áreas",
        "É responsável em seu trabalho e assume seus erros, aprendendo com eles",
        "Mantém o ambiente de trabalho limpo e organizado e cuida dos recursos da Emais como se fossem seus"],
    "time_forte": [
        "Coloca-se no lugar do outro e oferece ajuda sempre que possível",
        "É aberto a aprender e ensinar construindo relações de troca com as demais áreas pensando nos ideais da Emais"],
    "obstinacao": [
        "Resolve e/ou reporta o problema ao responsável assim que o identifica, propõe soluções e acompanha a resolução",
        "Realiza suas entregas no prazo respeitando os colegas"],
    "meritocracia": [
        "Sabe ouvir e receber elogios/críticas a seu respeito e acolhe as sugestões",
        "Elogia o bom trabalho dos colegas e sugere melhorias com transparência"],
}

VENDAS = {
    "foco_cliente": [
        ADM["foco_cliente"][0],
        "Conhece os clientes Emais, planeja o atendimento e atua para superar as expectativas",
        "Faz seu trabalho com qualidade, assertividade e consistência colocando-se no lugar do cliente"],
    "postura_dono": ADM["postura_dono"][:3],
    "time_forte": ADM["time_forte"],
    "obstinacao": ADM["obstinacao"],
    "meritocracia": ADM["meritocracia"],
}

OBRAS = {
    "foco_cliente": ["Sugere novas formas de fazer seu trabalho buscando sempre melhorá-lo"],
    "postura_dono": ["Mantém o ambiente de trabalho limpo e organizado e cuida dos materiais, máquinas, "
                     "equipamentos e ferramentas como se fossem seus"],
    "obstinacao": ["Resolve e/ou reporta o problema ao responsável assim que o identifica e propõe soluções"],
}

TATICO = {
    "foco_cliente": [
        "Busca referências externas e propõe ações e soluções no tempo adequado agregando melhorias para sua área e para Emais",
        "Conhece/aprende com os clientes Emais e atua para antecipar e superar suas expectativas",
        "Faz seu trabalho com qualidade, assertividade e consistência colocando-se no lugar do cliente"],
    "postura_dono": [
        "Conhece e busca informações sobre a Emais e tem iniciativa para aprender sobre o mercado",
        "É consciente da contribuição e do impacto do seu trabalho no todo, trocando informações e buscando a sincronização entre as áreas",
        "É responsável e assume os riscos de suas ações, reconhecendo os próprios erros e aprendendo com eles",
        "Preserva o ambiente de trabalho e otimiza recursos"],
    "time_forte": [
        "Coloca-se no lugar do outro e prontifica-se a ajudar",
        "É aberto a aprender e ensinar construindo relações de troca com as demais áreas pensando nos ideais da Emais"],
    "obstinacao": [
        "Identifica e entende a causa do problema, propõe e/ou implementa soluções com agilidade e acompanha a execução para garantir o resultado",
        "Conhece suas metas, não se limita a entregar somente o esperado, cumprindo prazos e respeitando os colegas"],
    "meritocracia": [
        "Sabe ouvir e receber elogios/críticas a seu respeito e aceita sugestões buscando crescimento individual e coletivo",
        "Elogia/reconhece com imparcialidade o bom trabalho e ações dos colegas e faz críticas construtivas de forma transparente"],
}

ESPECIALISTA = {
    "foco_cliente": [
        "Busca referência externa, inova o formato de trabalho e traz soluções de forma ágil buscando melhoria nos processos e no atendimento aos stakeholders",
        TATICO["foco_cliente"][1], TATICO["foco_cliente"][2]],
    "postura_dono": [
        "Entende sobre o negócio da Emais e é atento às movimentações do mercado",
        TATICO["postura_dono"][1], TATICO["postura_dono"][2], TATICO["postura_dono"][3]],
    "time_forte": [
        "Tem empatia e postura colaborativa",
        TATICO["time_forte"][1]],
    "obstinacao": [
        TATICO["obstinacao"][0],
        "É ousado em buscar alternativas para viabilizar o alcance de suas metas, não se limitando a entregar somente o esperado, cumprindo e respeitando os colegas"],
    "meritocracia": TATICO["meritocracia"],
}

LIDERANCA = {
    "foco_cliente": [
        "Implementa melhorias e novas soluções baseado em tendências e estimula os colaboradores a pensar em formas diferentes e melhores de fazer seu trabalho",
        "Conhece o perfil e as necessidades dos clientes Emais e dissemina esse conhecimento ao time",
        "Acompanha e orienta o time, garantindo que o cliente seja atendido com qualidade"],
    "postura_dono": [
        "Compreende e comunica informações relevantes sobre o negócio e mercado de atuação da Emais e estimula o time a buscar esse conhecimento",
        "Compartilha e provê informações ao time para adquirirem a visão do todo e entenderem o impacto das suas ações no negócio a fim de promover a sincronização entre as áreas",
        "É responsável pelos riscos e consequências de suas decisões e compromete-se a reparar os erros cometidos trazendo soluções, sem achar culpados",
        "Preserva juntamente com o time o ambiente de trabalho e a otimização dos recursos, incentivando a sustentabilidade da Emais"],
    "time_forte": [
        "Coloca-se no lugar do outro, prontifica-se a ajudar e direciona o time a assumir uma postura colaborativa no dia a dia",
        "Constrói relações em função dos ideais da Emais, promovendo um ambiente de troca e interação entre todos",
        "Se desenvolve e aprimora seus conhecimentos fortalecendo seu papel como gestor",
        "Gerencia e desenvolve seu time dando o suporte necessário e incentiva a busca pelo desenvolvimento",
        "Identifica e prepara seu sucessor"],
    "obstinacao": [
        "Orienta o time para identificação das causas dos problemas, define as soluções com agilidade, constrói e implementa planos de ação",
        "Comunica com clareza as metas e o que é esperado de cada colaborador, provendo recursos para seu alcance",
        "Compromete-se e lidera o time a entregar melhores resultados de forma respeitosa"],
    "meritocracia": [
        "Dá oportunidade e sabe ouvir com imparcialidade os elogios e críticas do time e colegas",
        "Ressalta e reconhece ações positivas dos colaboradores frente ao time e realiza, individualmente, críticas construtivas visando o desenvolvimento mútuo",
        "Acompanha, mensura e toma decisões baseadas no desempenho dos colaboradores de seu time",
        "Orienta os colaboradores de seu time por meio de feedbacks constantes construindo e acompanhando o plano de desenvolvimento individual de cada um"],
}

GERENCIA = {
    "foco_cliente": [
        "Fomenta a busca por otimização e inovação do trabalho e toma decisões para implementá-las com agilidade",
        "Está atento às necessidades dos clientes Emais, dissemina esse conhecimento ao time e assegura que o atendimento realizado supere as expectativas",
        "Toma decisões baseadas no impacto e valor agregado para o cliente final"],
    "postura_dono": [
        "Compreende e comunica sobre as tomadas de decisão e informações relevantes sobre o negócio e mercado de atuação da Emais e estimula o time a buscar esse conhecimento",
        "Promove a sincronização entre as áreas, disseminando o conhecimento sobre o impacto gerado pelas entregas e estimulando a troca de informações entre os times",
        "Se responsabiliza por suas decisões e propaga a cultura de aprender com os erros e de agir imediatamente, comprometendo-se com a Emais",
        "Garante a perenidade da Emais patrocinando as práticas de otimização de recursos e preservação do ambiente de trabalho"],
    "time_forte": [
        "Promove um ambiente de colaboração e direciona o time a assumir uma postura empática",
        "Constrói relações de parceria com pares, subordinados e times visando o crescimento da Emais",
        "Se desenvolve e aprimora seus conhecimentos fortalecendo seu papel como gestor",
        "Gerencia e desenvolve seu time dando o suporte necessário e incentiva a busca pelo desenvolvimento",
        "Identifica e prepara seu sucessor e garante que os líderes de sua área façam o mesmo"],
    "obstinacao": [
        "Orienta o time para identificação das causas dos problemas, valida as soluções com agilidade e garante a implementação dos planos de ação",
        "Define e comunica com clareza as metas e o que é esperado de cada colaborador, provendo recursos para seu alcance",
        "Compromete-se e lidera o time a entregar melhores resultados de forma respeitosa"],
    "meritocracia": [
        "Promove um ambiente aberto e imparcial para troca de elogios e críticas entre os times",
        "Ressalta e reconhece ações positivas dos colaboradores frente ao time e realiza, individualmente, críticas construtivas visando o desenvolvimento mútuo",
        "Acompanha, mensura e assegura que as decisões sejam baseadas no desempenho dos colaboradores de seu time",
        "Orienta os colaboradores de seu time por meio de feedbacks constantes construindo e acompanhando o plano de desenvolvimento individual de cada um e garante que os líderes de sua área façam o mesmo"],
}

DIRETORIA = {
    "foco_cliente": [
        "Lidera a inovação e a otimização no ambiente de trabalho, tomando decisões ágeis e embasadas para impulsionar a implementação de melhorias",
        "Compreende profundamente as necessidades dos clientes finais, dissemina esse entendimento para a equipe e assegura a implementação de estratégias que excedam as expectativas de atendimento ao cliente",
        "Direciona as decisões estratégicas com base no valor e impacto para o cliente final, garantindo a orientação ao cliente em todas as ações da empresa"],
    "postura_dono": [
        "Define a estratégia de negócios com base no entendimento do mercado, garantindo que todas as decisões sejam bem informadas e comunicadas efetivamente à equipe",
        "Garante a eficácia da comunicação interdepartamental e a sincronização das áreas, promovendo um ambiente de colaboração que valoriza a troca de conhecimento e a compreensão do impacto das entregas",
        "Assume a responsabilidade não apenas pelas próprias decisões, mas também pelas decisões da organização como um todo, e promove uma cultura que valoriza o aprendizado a partir de erros e ações rápidas e efetivas",
        "Assegura a sustentabilidade de longo prazo da Emais, liderando iniciativas que otimizam o uso de recursos e preservam um ambiente de trabalho positivo"],
    "time_forte": [
        "Cultiva um ambiente de trabalho colaborativo e inclusivo, incentivando a equipe a adotar uma postura empática em todas as interações",
        "Constrói e mantém relações sólidas e de parceria com todos os níveis da organização, incentivando a mesma conduta em sua equipe para fomentar o crescimento coletivo",
        "Está comprometido com o desenvolvimento individual e profissional contínuo, buscando aprimorar suas habilidades para melhorar o desempenho no papel de líder e diretor",
        "Desenvolve seu time e o incentiva a compartilhar conhecimento em busca do desenvolvimento mútuo, dando o suporte necessário",
        "Proativamente identifica e prepara potenciais sucessores, incentivando outros líderes a fazerem o mesmo, garantindo a continuidade do negócio"],
    "obstinacao": [
        "Inspira a equipe a identificar a origem dos problemas e aplicar soluções eficazes de maneira rotineira através do método, reforçando uma cultura de resolução de problemas proativa e a implementação de planos de ação adequados",
        "Define, elabora e comunica metas e expectativas claras aos gestores diretos, provendo os recursos necessários para seu alcance e garantindo o desdobramento adequado às equipes",
        "Serve de exemplo em respeito e compromisso, liderando sua equipe para alcançar resultados cada vez melhores"],
    "meritocracia": [
        "Cultiva um ambiente de abertura e imparcialidade, onde o comportamento e as atitudes do time representam os valores da empresa",
        "Age como um exemplo de comportamento positivo para a equipe, reconhece as ações positivas e fornece críticas construtivas de maneira privada e individual, visando o desenvolvimento mútuo",
        "Assegura que todas as decisões sejam fundamentadas no desempenho individual dos membros da equipe, promovendo um ambiente de trabalho orientado para resultados e meritocracia",
        "Estabelece uma cultura de desenvolvimento contínuo, fornecendo feedbacks constantes e acompanhando o plano de desenvolvimento individual, assegurando que os líderes façam o mesmo, e estimula o crescimento pessoal e coletivo por meio de orientação personalizada"],
}

NIVEIS = {
    "operacional_obras": OBRAS, "operacional_adm": ADM, "vendas": VENDAS, "tatico": TATICO,
    "especialista": ESPECIALISTA, "lideranca": LIDERANCA, "estrategico_gerencia": GERENCIA,
    "estrategico_diretoria": DIRETORIA,
}

# ---------- Blocos comuns ----------
# (ordem, texto, tipo, extra) extra: escala, opcoes, obrigatoria, evidencia, mae, cond, min_c, min_p
def q(texto, tipo, **kw):
    return dict(texto=texto, tipo=tipo, **kw)

CURTA = dict(min_c=3, min_p=1)

BLOCOS_COMUNS = {
    ("prework_colaborador", "Pré-work do colaborador", "prework_colaborador"): [
        q("Qual o seu nível de escolaridade?", "escolha", opcoes=ESCOLARIDADE),
        q("Cursos extracurriculares", "aberta", obrigatoria=False),
        q("Nível de inglês", "escolha", opcoes=IDIOMA),
        q("Nível de espanhol", "escolha", opcoes=IDIOMA),
        q("Histórico de carreira dentro e fora da Emais", "aberta"),
        q("Você possui interesse em atuar em outras áreas da Emais?", "sim_nao"),
        q("Se sim, em quais áreas?", "aberta", mae=6, cond="Sim", **CURTA),
        q("Você possui disponibilidade para atuar em outras localidades?", "sim_nao"),
        q("Você considera que há algum conhecimento específico que precisa desenvolver para sua atual função?", "sim_nao"),
        q("Se sim, quais conhecimentos?", "aberta", mae=9, cond="Sim", min_c=10, min_p=2),
    ],
    ("prework_gestor", "Pré-work do gestor", "prework_gestor"): [
        q("Você considera que esse colaborador tem potencial para crescer na carreira, podendo se tornar um possível par?", "sim_nao"),
        q("Se sim, em quais áreas?", "aberta", mae=1, cond="Sim", **CURTA),
        q("Se sim, em quanto tempo?", "escolha", opcoes=PRAZO, mae=1, cond="Sim"),
        q("Em quais cargos?", "aberta", mae=1, cond="Sim", **CURTA),
        q("Você considera que este colaborador tem potencial de carreira em outras áreas?", "sim_nao"),
        q("Em quanto tempo?", "escolha", opcoes=PRAZO, mae=5, cond="Sim"),
        q("Justifique o potencial em outras áreas", "aberta", mae=5, cond="Sim"),
        q("Existem possíveis sucessores para a posição atual deste colaborador caso ele seja movimentado dentro ou fora da área?", "sim_nao"),
        q("O sucessor estará pronto em quanto tempo?", "escolha", opcoes=PRAZO, mae=8, cond="Sim"),
        q("O colaborador entregou tudo que foi previsto na Contratação de Desempenho?", "sim_nao"),
        q("O colaborador realizou alguma ação fora da curva? (ações que não foram previstas nas metas)", "sim_nao"),
        q("Justifique a ação fora da curva", "aberta", mae=11, cond="Sim"),
    ],
    ("potencial", "Pontos fortes e a desenvolver", "potencial"): [
        q("Descreva os pontos fortes, com exemplos de comportamentos ou situações", "aberta"),
        q("Descreva os pontos a desenvolver, com exemplos de comportamentos ou situações", "aberta"),
    ],
    ("avaliacao_lider", "Avaliação do Gestor", "avaliacao_lider"): [
        q("Você considera que seu gestor te desenvolve e te incentiva a buscar desenvolvimento?", "escala", escala="concordancia", evidencia=True),
        q("Você considera que seu gestor dá feedbacks constantes sobre seu trabalho, elogiando e corrigindo rotas sempre que necessário?", "escala", escala="concordancia", evidencia=True),
        q("Você considera que seu gestor promove um ambiente de colaboração na Emais?", "escala", escala="concordancia", evidencia=True),
        q("Você o considera um líder inspirador?", "escala", escala="concordancia", evidencia=True, rotulo="Descreva fatos e dados"),
        q("Cite no mínimo 1 comportamento que você considera como PONTO FORTE dessa pessoa (com exemplos de comportamentos ou situações ocorridas)", "aberta"),
        q("Cite no mínimo 1 comportamento que você considera como PONTO A DESENVOLVER dessa pessoa (com exemplos de comportamentos ou situações ocorridas)", "aberta"),
        q("Comentários gerais", "aberta", obrigatoria=False),
    ],
    ("avaliacao_pares", "Avaliação dos Pares", "avaliacao_pares"): [
        q("Você considera que essa pessoa promove um ambiente de colaboração, construindo relações com pares, subordinados e times visando o crescimento da Emais?", "escala", escala="concordancia"),
        q("Você considera que essa pessoa constrói uma equipe forte?", "escala", escala="concordancia"),
        q("Se pudesse escolher, trabalharia com ele(a) em novo projeto/atividade?", "escala", escala="concordancia"),
        q("Cite no mínimo 1 comportamento que você considera como PONTO FORTE dessa pessoa (com exemplos de comportamentos ou situações ocorridas)", "aberta"),
        q("Cite no mínimo 1 comportamento que você considera como PONTO A DESENVOLVER dessa pessoa (com exemplos de comportamentos ou situações ocorridas)", "aberta"),
        q("Comentários gerais", "aberta", obrigatoria=False),
    ],
    ("contratacao", "Contratação de Desempenho", "contratacao"): [
        q("Quais são os ENTREGÁVEIS esperados para o próximo período avaliativo?", "aberta"),
        q("Quais são os possíveis OBSTÁCULOS que o colaborador poderá encontrar durante o período (conhecimento, técnica, gestão, pessoas) e como sugere tratá-los?", "aberta"),
        q("Quais COMPETÊNCIAS EMAIS você identifica como fortaleza deste colaborador e quais devem ser desenvolvidas? Detalhe os comportamentos esperados.", "aberta"),
        q("Comentários do LÍDER sobre a Contratação de Desempenho acordada", "aberta"),
    ],
    ("feedback_gestor", "Feedback ao liderado", "feedback_gestor"): [
        q("Formalize os principais pontos acordados e conclusões do feedback realizado ao seu liderado", "aberta"),
    ],
    ("feedback_colaborador", "Feedback recebido", "feedback_colaborador"): [
        q("Você recebeu o seu feedback dentro do prazo estipulado pela Emais?", "escolha",
          opcoes=["Ainda não recebi meu feedback", "Recebi o feedback fora do prazo", "Recebi o feedback dentro do prazo"]),
        q("Você concorda com o feedback recebido?", "escolha",
          opcoes=["Discordo", "Concordo parcialmente", "Concordo totalmente"]),
        q("Fique à vontade para colocar seus comentários sobre o feedback recebido", "aberta", obrigatoria=False),
    ],
}

COM_PREWORK = {"tatico", "especialista", "lideranca", "estrategico_gerencia", "estrategico_diretoria"}
AVALIA_LIDER = {"vendas", "tatico", "especialista", "lideranca", "estrategico_gerencia"}
PARES = {"estrategico_diretoria"}
COM_POTENCIAL = set(NIVEIS) - {"operacional_obras"}


def lit(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "true" if v else "false"
    if isinstance(v, (int, float)):
        return str(v)
    return "'" + str(v).replace("'", "''") + "'"


def json_lit(lst):
    import json
    return lit(json.dumps(lst, ensure_ascii=False)) + "::jsonb"


import json

blocos = []
for (codigo, nome, tipo), perguntas in BLOCOS_COMUNS.items():
    blocos.append(dict(codigo=codigo, nome=nome, tipo=tipo, perguntas=perguntas))
perfil_nome = dict((c, n) for c, n, _, _ in PERFIS)
comp_nome = dict(COMPETENCIAS)
for perfil, comps in NIVEIS.items():
    for comp, _ in COMPETENCIAS:
        if comps.get(comp):
            blocos.append(dict(codigo=f"comp_{perfil}_{comp}", nome=f"{comp_nome[comp]} - {perfil_nome[perfil]}",
                               tipo="competencia", competencia=comp, perfil=perfil,
                               perguntas=[q(t, "escala", escala="competencia", evidencia=True) for t in comps[comp]]))

formularios = [
    dict(codigo="contratacao", nome="Contratação de Desempenho", tipo="contratacao", perfil=None,
         itens=[["contratacao", "gestor", False]]),
    dict(codigo="feedback", nome="Ciclo de Feedback", tipo="feedback", perfil=None,
         itens=[["feedback_gestor", "gestor", False], ["feedback_colaborador", "auto", False]]),
]
for perfil, comps in NIVEIS.items():
    bc = [f"comp_{perfil}_{c}" for c, _ in COMPETENCIAS if comps.get(c)]
    itens = []
    if perfil in COM_PREWORK:
        itens.append(["prework_colaborador", "auto", False])
        itens += [[b, "auto", False] for b in bc]
        itens.append(["potencial", "auto", False])
        itens.append(["prework_gestor", "gestor", False])
    itens += [[b, "gestor", True] for b in bc]
    if perfil in COM_POTENCIAL:
        itens.append(["potencial", "gestor", False])
    if perfil in AVALIA_LIDER:
        itens.append(["avaliacao_lider", "lider", False])
    if perfil in PARES:
        itens.append(["avaliacao_pares", "par", False])
    formularios.append(dict(codigo=f"avaliativo_{perfil}", nome=f"Ciclo Avaliativo - {perfil_nome[perfil]}",
                            tipo="avaliativo", perfil=perfil, itens=itens))

dados = dict(
    perfis=[dict(codigo=c, nome=n, nivel=nv, assistido=a) for c, n, nv, a in PERFIS],
    competencias=[dict(codigo=c, nome=n) for c, n in COMPETENCIAS],
    escalas=[dict(codigo=c, nome=n, opcoes=o) for c, (n, o) in ESCALAS.items()],
    faixas=[dict(nome=n, min=mn, max=mx) for n, mn, mx in FAIXAS],
    blocos=blocos,
    formularios=formularios,
)
doc = json.dumps(dados, ensure_ascii=False, separators=(",", ":")).replace("$biblioteca$", "")

print(f"""-- =====================================================================
-- EMAIS Desempenho · 03 · Biblioteca de formulários
-- Gerado por supabase/seed/gerar_biblioteca.py (perguntas da Mindsight 2026,
-- textos padronizados e decisões de 10/11/2026). Não editar à mão.
-- =====================================================================
do $carga$
declare
  d jsonb := $biblioteca${doc}$biblioteca$::jsonb;
  x jsonb; p jsonb; i int; v_bloco int; v_form int;
begin
  insert into public.perfis (codigo, nome, nivel_complexidade, acesso_assistido, ordem)
  select e ->> 'codigo', e ->> 'nome', (e ->> 'nivel')::smallint, (e ->> 'assistido')::boolean, n
    from jsonb_array_elements(d -> 'perfis') with ordinality t(e, n);

  insert into public.competencias (codigo, nome, ordem)
  select e ->> 'codigo', e ->> 'nome', n from jsonb_array_elements(d -> 'competencias') with ordinality t(e, n);

  for x in select * from jsonb_array_elements(d -> 'escalas') loop
    insert into public.escalas (codigo, nome) values (x ->> 'codigo', x ->> 'nome');
    insert into public.escala_opcoes (escala_id, valor, rotulo, ordem)
    select (select id from public.escalas where codigo = x ->> 'codigo'), n, o #>> '{{}}', n
      from jsonb_array_elements(x -> 'opcoes') with ordinality t(o, n);
  end loop;

  insert into public.faixas_classificacao (rodada_id, nome, minimo, maximo, ordem)
  select null, e ->> 'nome', (e ->> 'min')::numeric, (e ->> 'max')::numeric, n
    from jsonb_array_elements(d -> 'faixas') with ordinality t(e, n);

  for x in select * from jsonb_array_elements(d -> 'blocos') loop
    insert into public.blocos (codigo, nome, tipo, competencia_id, perfil_id)
    values (x ->> 'codigo', x ->> 'nome', (x ->> 'tipo')::public.tipo_bloco,
            (select id from public.competencias where codigo = x ->> 'competencia'),
            (select id from public.perfis where codigo = x ->> 'perfil'))
    returning id into v_bloco;
    i := 0;
    for p in select * from jsonb_array_elements(x -> 'perguntas') loop
      i := i + 1;
      insert into public.perguntas (bloco_id, ordem, texto, tipo, escala_id, opcoes, obrigatoria, pede_evidencia,
                                    evidencia_rotulo, condicao_valor, min_caracteres, min_palavras)
      values (v_bloco, i, p ->> 'texto', (p ->> 'tipo')::public.tipo_pergunta,
              (select id from public.escalas where codigo = p ->> 'escala'),
              coalesce(p -> 'opcoes', case when p ->> 'tipo' = 'sim_nao' then '["Sim","Não"]'::jsonb end),
              coalesce((p ->> 'obrigatoria')::boolean, true),
              coalesce((p ->> 'evidencia')::boolean, false),
              coalesce(p ->> 'rotulo', 'Descreva as evidências de sua avaliação'),
              p ->> 'cond',
              coalesce((p ->> 'min_c')::smallint, 30),
              coalesce((p ->> 'min_p')::smallint, 5));
    end loop;
    i := 0;
    for p in select * from jsonb_array_elements(x -> 'perguntas') loop
      i := i + 1;
      if p ? 'mae' then
        update public.perguntas f set pergunta_mae_id = m.id
          from public.perguntas m
         where f.bloco_id = v_bloco and f.ordem = i and m.bloco_id = v_bloco and m.ordem = (p ->> 'mae')::int;
      end if;
    end loop;
  end loop;

  for x in select * from jsonb_array_elements(d -> 'formularios') loop
    insert into public.formularios (codigo, nome, tipo_rodada, perfil_id)
    values (x ->> 'codigo', x ->> 'nome', (x ->> 'tipo')::public.tipo_rodada,
            (select id from public.perfis where codigo = x ->> 'perfil'))
    returning id into v_form;
    insert into public.formulario_blocos (formulario_id, bloco_id, grupo, ordem, entra_na_nota)
    select v_form, (select id from public.blocos where codigo = it ->> 0), (it ->> 1)::public.grupo_avaliativo, n, (it ->> 2)::boolean
      from jsonb_array_elements(x -> 'itens') with ordinality t(it, n);
  end loop;
end $carga$;""")
