---
title: StrikeLab v3.0 — Legal/GDPR Critique (DPO Persona)
type: critique
persona: DPO
jurisdiction: PT / EU
spec: StrikeLab-v3-full.json (v3.0, 2026-05-27)
date: 2026-05-27
---

PERSONA: DPO — Legal/GDPR Compliance (CNPD / RGPD lens)

Notas preliminares ao Ricardo: revi o JSON integral. Não vi UMA referência a base jurídica, consentimento, retenção, DPIA, processadores, transferências internacionais, dados de menores ou direitos do titular. A spec é puramente operacional/funcional — o que numa lógica de produto é normal, mas para um sistema que cruza presença física, comportamento social e dados financeiros isto é, em termos de RGPD, um sistema **não-conforme by design**. Abaixo as fraquezas que considero mais expostas a queixa CNPD ou litigation civil.

WEAKNESS-1 [FATAL]: `triggers.social_ugc.story_checkin` + `antiAbuse.storyCheckInDetection` — Cruzamento de Instagram handle com check-in físico no Yogo (últimas 24h) constrói um perfil comportamental que combina **presença física georreferenciada** com **identidade social pública**. Sem base jurídica explícita, viola **Art. 6(1) RGPD** (lawful basis) e **Art. 5(1)(b) purpose limitation** — o aluno contratou treino de artes marciais, não consentiu vigilância de redes sociais. Adicionalmente, padrões de presença física combinados com indicadores de atividade desportiva podem qualificar-se como **dados de saúde indiretos sob Art. 9(1)** (special categories), ativando o regime reforçado. Sem opt-in explícito + finalidade declarada, isto é coima CNPD a olhos fechados.

WEAKNESS-2 [FATAL]: `tiers` + `operationalNotes.tierEvaluation: "Continuous"` — Avaliação automática contínua que produz **benefícios económicos significativos** (15% desconto mensal, 1 mês grátis/ano, sessão privada/mês para Diamante; descontos 5–10% para Bronze/Ouro/Prata). Isto é **decisão individual automatizada com efeitos significativos** ao abrigo do **Art. 22 RGPD**. A spec não prevê: (i) direito a NÃO ser sujeito a profiling, (ii) intervenção humana significativa, (iii) direito de contestar a decisão, (iv) informação prévia ao titular. Diamante exige "manualValidation" mas todas as outras patentes são puramente algorítmicas. Risco MUITO ALTO porque o RGPD exige explicit consent OU contractual necessity OU autorização legal — nenhuma das três se aplica claramente à gamificação.

WEAKNESS-3 [FATAL]: `lifetimeXP.behavior: "Acumula para sempre, nunca decresce"` + `consumable: false` — Violação direta do **Art. 5(1)(e) storage limitation** e **Art. 17 right to erasure**. Se um aluno cancela subscrição e exerce o direito ao esquecimento, o sistema é desenhado para *NUNCA* apagar XP. Pior: `tiers.revocationPolicy: "Manual only"` cria status quasi-permanente. Não há retention policy declarada, nem trigger de purga após churn (e.g., "X meses sem subscrição ativa → anonimização"). O modelo de dados é literalmente incompatível com o RGPD. Igualmente exposto: `event log append-only` (implícito pela arquitetura dual-ledger) — append-only sem TTL é anti-RGPD.

WEAKNESS-4 [FATAL]: `triggers.penalties.inactivity_long` (-50 pts por 14+ dias sem treino) + ranking público no grupo WhatsApp — Penaliza **inatividade física**, que correlaciona diretamente com: gravidez, doença, lesão, deficiência temporária, tratamento oncológico, depressão. Sob **Art. 9 RGPD** (dados de saúde) e **Lei Portuguesa n.º 4/2019** (acessibilidade) + **Lei n.º 46/2006** (não-discriminação por deficiência), penalizar visivelmente quem está incapacitado de treinar constitui **discriminação indireta**. Combinado com `triggers.renewal.low_usage_alert` (mensagem automática "está tudo bem?" que se uma aluna estiver em licença de luto recebe como assédio), o risco ético/legal é severo. Recomenda-se OBRIGATORIAMENTE: opt-out manual por motivo médico, sem necessidade de justificação detalhada.

WEAKNESS-5 [MAJOR]: `tiers.diamante.permanentStatus.wallPhoto: "Permanent photo on academy wall"` + `decisionVote: true` — Publicação de fotografia em espaço público (parede da academia) e atribuição de papel quasi-governativo ("decision vote"). A fotografia é **dado biométrico identificador** (Art. 4(14) RGPD) e a publicação física exige **consentimento explícito, escrito, específico e revogável** (Art. 7 + Art. 9 se considerado biométrico). A spec não define: (i) fluxo de consentimento, (ii) direito de remoção da parede pós-revogação, (iii) durabilidade ("permanent" colide com Art. 17). O "decisionVote" não está definido juridicamente — vota em quê? Decisões sobre OUTROS titulares de dados (e.g., revogação de tier por código de conduta)? Se sim, é processamento de dados de terceiros sem base.

WEAKNESS-6 [MAJOR]: `antiAbuse.duplicateAccountDetection: "Monitor name + phone + email + payment_method overlap"` — Cruzamento de identificadores diretos + financeiros para fraud detection é legítimo em princípio (legitimate interest, Art. 6(1)(f)) MAS exige **Legitimate Interest Assessment (LIA)** documentado, comunicação ao titular sob **Art. 13/14**, e proporcionalidade. A spec não documenta nada disto. `payment_method` adicionalmente cai sob **PSD2** e regras de processamento financeiro. Falta de DPIA aqui é praticamente certo de ser flagged pela CNPD numa auditoria.

WEAKNESS-7 [MAJOR]: `integrations.manychat` (Pro plan) — ManyChat é US-based (sede em San Francisco). Processamento de dados pessoais (IG handle, comportamento social, eventos cruzados com identidade do cliente) num processador fora UE exige: (i) **DPA (Data Processing Agreement)** assinado — Art. 28 RGPD; (ii) **SCCs (Standard Contractual Clauses)** pós-Schrems II — Art. 46; (iii) **Transfer Impact Assessment** (EDPB recommendations 01/2020); (iv) menção explícita no registo de atividades (Art. 30) e na privacy policy. Igualmente: Vercel (US), Spotify (DE/SE), Yogo (DK — UE, OK). A spec não menciona transferências.

WEAKNESS-8 [MAJOR]: `weeklyChallenges.publicAnnouncement: true` + `winnerBroadcast: true` no grupo WhatsApp — Divulgação pública de nome + pontos + comportamento (e.g., "Mariana ganhou Flash Check-in") num grupo onde os restantes participantes não consentiram em ver dados de terceiros, nem o vencedor consentiu necessariamente em ser broadcast. Viola **Art. 6** (base) e **Art. 5(1)(a) transparência/lawfulness**. Solução: opt-in explícito no momento do enrollment + opção de pseudónimo no ranking público.

WEAKNESS-9 [MAJOR]: **Menores de idade** — Spec não menciona uma única vez "minor", "<18", "guardian", "parental consent". Academias de artes marciais em Portugal têm rotineiramente alunos de 6–17 anos. Sob **Art. 8 RGPD** + **Lei n.º 58/2019 Art. 16** (lei portuguesa de execução), consentimento de menores de 13 anos requer autorização parental; entre 13–18, regime híbrido. Gamificação que envolve perfis públicos, fotos, ranking, IG handles aplicada a menores **sem consentimento parental documentado** é violação grave. Recomenda-se EXCLUIR menores do sistema ou criar fluxo paralelo com consentimento parental escrito.

WEAKNESS-10 [MAJOR]: `triggers.growth.referral_converted` + `dupla` + `embaixador_ratio` — Processamento de **dados de terceiros** (o convidado, o parceiro de dupla) antes destes serem clientes ou consentirem. Quando o "Mariana convida João" gera 1000 pts para Mariana, o João já está a ter os seus dados (identidade, evento de signup, padrão de check-ins) processados num contexto de gamificação para o qual nunca foi informado. **Art. 14 RGPD** exige informação aos titulares cujos dados foram obtidos indiretamente.

WEAKNESS-11 [MINOR]: `triggers.social_ugc.music_choice` via Spotify API — Preferência musical pode revelar **convicções religiosas, políticas, ou orientação sexual** (Art. 9). Provavelmente baixo risco prático mas merece menção numa DPIA.

WEAKNESS-12 [MINOR]: `monthlyReset` + `lastUpdated` — falta versioning da política de gamificação. RGPD exige que alterações materiais a um sistema de profiling sejam comunicadas (Art. 13(3)). Sem changelog versionado e mecanismo de notificação, qualquer alteração futura aos pesos de XP é juridicamente frágil.

TOP REGULATORY RISKS:
1. **Aluno em tratamento oncológico** vê o seu nome cair no ranking público após `inactivity_long` ser aplicado. Apresenta queixa CNPD por discriminação indireta + processamento de dados de saúde sem base Art. 9. CNPD investiga, pede DPIA que não existe → coima até €20M ou 4% do volume de negócios (Art. 83(5)). Cenário realista, dano reputacional severo.
2. **Ex-aluno cancela subscrição, exerce Art. 17** ("apaga tudo"). Strike House responde "XP é permanente". Aluno escala para CNPD ou tribunal cível. CNPD emite decisão vinculativa de eliminação + coima por non-compliance estrutural com storage limitation. Risco arquitetural fatal.
3. **Pais de aluno menor descobrem** que filho de 14 anos tem IG handle linkado a check-ins, recebe penalty messages automáticas, está no ranking público. Queixa por processamento de dados de menor sem consentimento parental (Art. 8) + falta de DPIA para profiling de menores (sempre exigida — EDPB Guidelines on Children). CNPD nas crianças é particularmente agressiva.

MISSING FROM SPEC:
- **Base jurídica declarada** por cada categoria de processamento (Art. 6)
- **Fluxo de consentimento opt-in** explícito, granular, revogável (Art. 7)
- **DPIA** obrigatória — preenche critérios EDPB (profiling sistemático + larga escala + dados sensíveis indiretos) (Art. 35)
- **Política de retenção** com TTLs por categoria de dado (Art. 5(1)(e))
- **Procedimento de erasure** que reconcilia com XP permanente (Art. 17)
- **Direito a opt-out de profiling automatizado** e revisão humana (Art. 22)
- **DPA + SCCs** com ManyChat, Vercel, Spotify (Art. 28, 46)
- **Registo de Atividades de Tratamento** (Art. 30)
- **Privacy notice/política de privacidade** atualizada com gamificação (Art. 13)
- **Fluxo de consentimento parental** para menores (Art. 8)
- **Tratamento de dados de saúde indiretos** — opt-out médico sem prova exigida (Art. 9)
- **Consentimento escrito específico** para wallPhoto Diamante (Art. 7 + direitos de imagem CC Português)
- **Procedimento de revogação** que apague também derivados (XP, tier, badges) (Art. 17)
- **DPO designado** (provavelmente exigível dado profiling sistemático — Art. 37)

VERDICT: A spec é desenhada como se o RGPD não existisse — combina profiling automatizado contínuo, retention infinita, dados de saúde indiretos, vigilância social cross-platform, divulgação pública de PII e transferências para fora-UE sem qualquer salvaguarda; em estado actual, é praticamente garantido que uma queixa CNPD termine em coima e ordem de redesenho arquitetural completo.
