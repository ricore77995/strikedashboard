PERSONA: Game Designer Hostil

I have shipped three live-service games. I have watched economies die in eight weeks because designers trusted players. StrikeLab v3.0 is not a gym loyalty program — it is a points printer with social posting attached, and the printer has no brake. Here is what I found.

WEAKNESS-1 [FATAL]: `embaixador_ratio` boost — `"stories_count_this_month > checkins_count_this_month"` — is a self-reinforcing perverse incentive that punishes training and rewards posting.

The trigger reads literally: more stories than check-ins this month activates a permanent x1.5 multiplier "until end of current month" — and the note says "Calculado em tempo real; ativa assim que ratio é ultrapassado". A student does ONE class (1 check-in) and TWO stories (story_organic at 250 pts/wk + story_checkin at 80 pts/day). Ratio 2:1. Boost on. Now every subsequent point earned this month is multiplied. The optimal strategy is explicit: train as little as possible, post as much as possible, ride the multiplier on the trickle of training you do. You have built an Instagram influencer program disguised as a gym. The behaviour you reward is staying home and filming yourself in Strike House merch. Marcelo will see story spam in his ManyChat feed, empty mats, and growing point liabilities.

WEAKNESS-2 [FATAL]: `referral_converted` 2500-point payout (1000 + 1500) plus a x1.5 Embaixador boost is collusion-grade with only ~150 active subscribers.

`antiAbuseRequirements: { minCheckinsByReferred: 4, minRenewalsByReferred: 1 }` is a speed bump, not a fence. Four check-ins is one week. One renewal is one auto-charge that fires whether the friend ever shows again. Two friends collude: each invites the other under a different phone number/email. Both earn 2500 pts (= €42 silver-tier prize equivalent each) plus 14 days of x1.5 Embaixador stacking with weekend/streak. `duplicateAccountDetection: "Monitor name + phone + email + payment_method overlap"` doesn't catch two real humans who simply swap referral codes — that's not a duplicate account, it's a referral ring. Three couples doing this once a year = €252 in prizes + 6 months of free training (one diamante = 1 mês grátis exposure compounds). Yogo has no concept of a referral chain audit. You will not see this happening.

WEAKNESS-3 [FATAL]: `story_organic` 250 pts vs `story_checkin` 80 pts — the spec literally pays 3.1x MORE for posting WITHOUT training first.

Read the lines back to back: `story_checkin` = "Story com @ feito até 24h após check-in" = 80 pts. `story_organic` = "Story orgânico (sem check-in associado) ... NO_checkin_today" = 250 pts. The bot uses `storyCheckInDetection: "Bot queries Yogo for check-in in last 24h to differentiate"`. So if the system sees a check-in today, you get the cheap 80. If it sees no check-in, you get the premium 250. **The economically rational student posts the story on a rest day, gets 250 + activates `ugc_story` x1.5 for 24h, THEN trains tomorrow under the boost.** The "thank you for representing us outside" framing is laudable but the math creates a "don't check-in on story days" optimization. Worse: the story_organic cap is 1/week vs story_checkin 1/day — both stack on `embaixador_ratio` ratio counting. The whale player runs 1 story_organic + 6 story_checkin = ratio 7:N where N is check-ins, easy to keep above check-ins all month.

WEAKNESS-4 [MAJOR]: `reel` at 600 pts + x2.0 boost 72h, cap 2/month — single behaviour worth more than a week of training under all three plans.

P12 student trains 3x/week = 4 weeks = 12 classes × 45 pts = 540 base pts. ONE reel = 600 pts + 72h of x2.0 multiplier covering ~6 classes (540 base × 2.0 = 1080 from training under boost vs 540 unboosted). Two reels/month = 1200 pts + ~12 boosted classes = the reel player earns roughly 2-3x the training-only player without setting foot in the dojo more than them. The spec already shows the cap on `reel: "2 per month"` — Ricardo is signing up to credit any student 1200 free points for two videos. Combined with WEAKNESS-1's ratio boost, the meta is: "Be a content creator who also occasionally trains." This is not the customer Strike House wants to keep.

WEAKNESS-5 [MAJOR]: `streak_shield` "1x per month, auto-applied" + `broken_streak -30 pts AFTER shield used` creates a manipulable shield-conservation strategy.

The shield is auto-applied on first missed day. A clever student games the *order* of misses: deliberately skip Day 4 of a low-stakes streak to "burn" the shield early and reset clean, OR — worse — once shield is consumed, deliberately end the streak at exactly the moment the penalty (-30) is less than the boost cost of continuing. Worse, the shield is "auto-applied" which removes player agency entirely: a student returning from a real flu on a 6-day streak doesn't get to *choose* to save the shield for a higher-value 10-day or 15-day streak coming up. The mechanic punishes injury, illness, and family emergency while pretending to forgive them.

WEAKNESS-6 [MAJOR]: `multi_class_same_day classesToday >= 2` with `"points": "variable"` is an undefined exploit surface.

"Variable" is not a spec — it is a TODO disguised as a feature. With Yogo as source of truth and no per-modality time gate documented, a student can book back-to-back 90-min classes (legitimately offered for double trainers) and farm whatever "variable" turns out to mean. If it's >= base class points, the optimal day is "train twice on a weekend" (x1.8) at full stack with streak → astronomical single-day earn. Marcelo will discover this when the rankings show the same name at 8000+ pts by mid-month.

WEAKNESS-7 [MAJOR]: Liga dos Campeões "Top 3 out next month" creates explicit anti-engagement for your highest-engaged players.

Top 3 of any category in month N is removed from main ranking in month N+1. A Top 3 winner has every incentive to **not train hard in month N+1** — their pontos do mês are reset anyway, they cannot win prizes (removed from ranking), and XP accrues regardless. The whales — your best customers — get a structurally enforced rest month right after winning. They detrain. Some don't come back. You've designed a system where peak engagement is immediately followed by mandated disengagement. Habits broken at the moment they form.

WEAKNESS-8 [MAJOR]: `mini_random` 60-140 flat pts, "2-4x per week, randomly assigned" — the spec doesn't define WHO is eligible, but base class pts are 35-60.

A mini boost pays MORE than completing an actual class. The message accidentally taught is: "the lottery pays better than the work." Worse, with no published selection criteria, every un-selected student perceives favouritism (Ricardo's mates, Marcelo's PT clients). With 150 subscribers and 2-4 awards/week (8-16/month), <11% of students get any given month. The other 89% see the broadcast "{name} got +120 pts!" in the academy_group and feel cheated. You've manufactured a low-grade resentment generator running in the background of your community channel.

WEAKNESS-9 [MAJOR]: Plano Livre + `atleta` boost (x1.4) auto-activates at 12 classes/month and stays until month end — Livre students dominate the rankings structurally.

P8 caps at 8 classes × 60pts × max boost = 1440 base. P12 caps at 12 × 45 = 540 base before boost. Livre has no cap and unlocks a self-sustaining x1.4 after 12 classes, plus access to higher `perfectWeek` thresholds (4 classes/wk = 220 bonus repeatable). Modelled at 20 classes/month Livre under boosts → easily 12000+ pts, hits monthly_gold (€40 casaco). P8 student doing every single class under decent boosts caps near 6000-7000 (silver). The €25 premium between plans gets a 2-3x prize advantage. Lower-tier paying customers cannot win.

WEAKNESS-10 [MAJOR]: Cross-training requires "uniqueModalitiesThisWeek >= 2" but Strike House offers only Muay Thai + Boxing — students with single-modality preference (or coach preference) are permanently locked out of 200 pts/week + missing 1 prize category entirely (`most_cross_trainer`).

This is ~800 pts/month a Muay-Thai-only purist literally cannot earn. Over 12 months = 9600 pts ≈ entire Bronze tier XP gate. The system *forces* a stylistic dilution of training that contradicts martial arts pedagogy. Worse, the spec exposes a prize category that excludes single-modality students by design — a structural unfairness baked into the leaderboard, not gameable behaviour.

WEAKNESS-11 [MAJOR]: Monthly reset creates a "Day 28-31 desperation rush" that breaks operational capacity.

Pontos do mês zera on Day 1. Every prize threshold (3000/6000/10000/15000) is a cliff. Students 200-500 pts short of their cliff on Day 27 will book every class with capacity, regardless of whether the class is at their level or even open. Saturday boost (x1.8) + last-weekend desperation = stampede. Strike House mat capacity does not flex. Marcelo gets to be the bad guy turning students away from "their" prize. First month of operation will reveal this; by month three, the bottom of the table has given up entirely (gap too large to close) and the top is burning out.

WEAKNESS-12 [MAJOR]: Diamante 150k XP + 24 meses + manual validation + `decisionVote: true` — governance black box.

150,000 XP at base pointsPerClass without boosts (XP gets no boosts per `ledgerSeparation`): P12 student does max 144 classes/year × 45 = 6480 XP/year — needs **23 years** to organically hit Diamante. Even Plano Livre at 20 classes/month × 12 × 35 = 8400 XP/year — **18 years**. Add full-plan bonuses and milestones (~5000-7000 XP/year extra) and you still hit ~12-15 years minimum. The "24 months" minimum is decorative; the XP gate is the real wall and it's effectively unreachable. Worse: `decisionVote: true` is undefined governance — if no one reaches Diamante, the vote never matters; if anyone does, what happens when their vote disagrees with Ricardo + Marcelo? The tier promises power it doesn't actually grant.

WEAKNESS-13 [MAJOR]: `inactivity_long -50 pts` punishes injury, illness, and life — `loss aversion` against existing paying customers.

The penalty applies at `daysSinceLastClass >= 14`. A student with a torn meniscus who is still paying their subscription loses 50 pts every cycle. A new mother on maternity loses 50 pts. The student churning to gym B sees a confirming "see, the gym took my points away" message. Loss aversion research (Kahneman) is unambiguous: a -50 stings more than a +60 class reward. This is a churn accelerant aimed at exactly the moment a customer is most fragile.

WEAKNESS-14 [MINOR]: `monthly_diamond` prize "1 mês grátis" at `approxCost_eur: 10` — accounting fiction.

The spec lists the cost of a free month as €10 (presumably marginal cost). The student paying €60 for P12 redeems that prize → Strike House loses €60 in revenue, not €10. If two Diamantes hit the 15000 cliff in the same month, that's €120 of foregone subscription revenue charged against a "€10 cost" budget. The economic model in the spec is lying to itself about prize liability.

ECONOMIC MODEL: Worst-case stack (Livre, Saturday, streak 15, post-renovação, with reel boost, with embaixador_ratio, with embaixador_referral) sums deltas 0.8 + 1.5 + 0.6 + 1.0 + 0.5 + 0.5 = 4.9 → capped at 3.0x. But the rate of approach is broken: ANY two of {weekend, streak_10, ugc_reel, atleta+renovação} already saturates the cap, meaning the cap is **trivially hit and provides zero meaningful brake on aggressive players** while moderately-engaged students never approach it. Modelled prize liability: top 10 students hitting monthly_gold (€40) + 1 Diamante hitting "1 mês grátis" (true cost €60) = ~€460/month = €5,520/year on a 150-customer base = ~€37/customer/year drag on margins, BEFORE referral-ring abuse, content-creator gaming, or operational cost of running ManyChat Pro + bot dev.

VERDICT: `embaixador_ratio: stories_count_this_month > checkins_count_this_month` is the single most exploitable mechanic — it converts every student into a content creator whose dominant strategy is "post more than you train," activates a permanent x1.5 multiplier with trivial effort (1 class + 2 stories), and silently destroys both the training culture and the point economy from inside.
