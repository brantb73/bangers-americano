import { computeStandings, playerName } from './scoring'
import type { Match, Round, Session, Standing } from './types'

function nameOf(session: Session, id: string): string {
  return playerName(session.players, id)
}

function teamLabel(session: Session, team: [string, string]): string {
  return `${nameOf(session, team[0])} and ${nameOf(session, team[1])}`
}

function scoredMatches(round: Round): Match[] {
  return round.matches.filter((m) => m.scoreA !== null && m.scoreB !== null)
}

function biggestBlowout(session: Session): { match: Match; round: Round; margin: number } | null {
  let best: { match: Match; round: Round; margin: number } | null = null
  for (const round of session.rounds) {
    for (const m of scoredMatches(round)) {
      const margin = Math.abs((m.scoreA ?? 0) - (m.scoreB ?? 0))
      if (!best || margin > best.margin) best = { match: m, round, margin }
    }
  }
  return best
}

function closestFinish(session: Session): { match: Match; round: Round; margin: number } | null {
  let best: { match: Match; round: Round; margin: number } | null = null
  for (const round of session.rounds) {
    for (const m of scoredMatches(round)) {
      const margin = Math.abs((m.scoreA ?? 0) - (m.scoreB ?? 0))
      if (margin < 1) continue
      if (!best || margin < best.margin) best = { match: m, round, margin }
    }
  }
  return best
}

function collectComments(
  session: Session,
): Array<{ round: number; court: number; text: string; match: Match }> {
  const out: Array<{ round: number; court: number; text: string; match: Match }> = []
  for (const round of session.rounds) {
    if (round.note?.trim()) {
      out.push({
        round: round.number,
        court: 0,
        text: round.note.trim(),
        match: round.matches[0]!,
      })
    }
    for (const m of round.matches) {
      if (m.comment?.trim()) {
        out.push({ round: round.number, court: m.court, text: m.comment.trim(), match: m })
      }
    }
  }
  return out
}

function describeMatch(session: Session, m: Match): string {
  const a = teamLabel(session, m.teamA)
  const b = teamLabel(session, m.teamB)
  return `${a}, ${m.scoreA} to ${m.scoreB}, over ${b}`
}

function winnerTeam(session: Session, m: Match): string {
  if ((m.scoreA ?? 0) > (m.scoreB ?? 0)) return teamLabel(session, m.teamA)
  return teamLabel(session, m.teamB)
}

function loserTeam(session: Session, m: Match): string {
  if ((m.scoreA ?? 0) > (m.scoreB ?? 0)) return teamLabel(session, m.teamB)
  return teamLabel(session, m.teamA)
}

/**
 * Generate a snarky podcast / highlight-reel recap for Bangers Americano.
 * Kept name `generateSportsCenterRecap` for compatibility. Pure client-side.
 */
export function generateSportsCenterRecap(session: Session): string {
  const standings = computeStandings(session)
  const champion = standings[0]
  const runnerUp = standings[1]
  const last = standings[standings.length - 1]
  const roundsPlayed = session.rounds.filter((r) => scoredMatches(r).length > 0).length
  const comments = collectComments(session)
  const blowout = biggestBlowout(session)
  const nailbiter = closestFinish(session)
  const sitDrama = session.rounds.some((r) => r.sittingOut.length > 0)

  const lines: string[] = []

  // Podcast cold open — conversational, not stiff TV
  lines.push(
    `Hey, welcome back to the Bangers Highlight Reel — your unofficial Americano podcast where the partners rotate, the wins and points pile up, and nobody's ego is safe. Tonight we had ${session.players.length} players, ${session.courts} court${session.courts === 1 ? '' : 's'}, and ${roundsPlayed} round${roundsPlayed === 1 ? '' : 's'} of “who am I playing with again?”`,
  )

  if (champion) {
    const gap = runnerUp ? champion.points - runnerUp.points : champion.points
    if (gap >= 15) {
      lines.push(
        `And let's not bury the lede: ${champion.name} ran away with it. ${champion.points} points. That's not winning — that's a public service announcement that the rest of you should've stayed home and practiced dinks.`,
      )
    } else if (gap <= 2 && runnerUp) {
      lines.push(
        `Photo finish energy. ${champion.name} sneaks past ${runnerUp.name}, ${champion.points} to ${runnerUp.points}. One more rally and we'd still be arguing about it in the group chat.`,
      )
    } else {
      lines.push(
        `Crown goes to ${champion.name} with ${champion.points} points. Not a runaway, not a miracle — just the person who stopped missing when it mattered. Congrats. The rest of you: noted.`,
      )
    }
  }

  // Podium with attitude
  if (standings.length >= 3) {
    const [a, b, c] = standings
    lines.push(
      `Podium check: ${a!.name} in first with ${a!.points}. ${b!.name} second at ${b!.points} — so close, so painful. ${c!.name} third with ${c!.points}, which is the sports equivalent of “thanks for coming.”`,
    )
  } else if (champion && runnerUp) {
    lines.push(
      `Final tally: ${champion.name} ${champion.points}, ${runnerUp.name} ${runnerUp.points}. Someone's buying pickleballs. Someone's buying silence.`,
    )
  }

  // Blowout snark
  if (blowout && blowout.margin >= 6) {
    lines.push(
      `Highlight of the night — and I use that word generously — Round ${blowout.round.number}, Court ${blowout.match.court}: ${describeMatch(session, blowout.match)}. Margin of ${blowout.margin}. That wasn't a match, that was a public service announcement. ${winnerTeam(session, blowout.match)} did the damage. ${loserTeam(session, blowout.match)}… participated enthusiastically.`,
    )
  }

  // Nailbiter
  if (nailbiter && nailbiter.margin <= 2 && nailbiter.match.id !== blowout?.match.id) {
    lines.push(
      `And then Round ${nailbiter.round.number} went full stress podcast: ${describeMatch(session, nailbiter.match)}. Decided by ${nailbiter.margin}. If your heart rate didn't spike, check your pulse — you might already be sitting out.`,
    )
  }

  // Sit-outs
  if (sitDrama) {
    const sample = session.rounds.find((r) => r.sittingOut.length > 0)
    if (sample) {
      const names = sample.sittingOut.map((id) => nameOf(session, id)).join(' and ')
      lines.push(
        `Sit-out corner, Round ${sample.number}: ${names}. Enjoy the bench — you'll be back… maybe. Fair rotation, unfair vibes. That's Americano, baby.`,
      )
    }
  }

  // Round-by-round (snarky but factual)
  const highlightRounds = session.rounds.filter((r) => scoredMatches(r).length > 0).slice(0, 4)
  for (const round of highlightRounds) {
    const bits = scoredMatches(round).map((m) => describeMatch(session, m))
    let line = `Round ${round.number} reel: ${bits.join('. ')}.`
    if (round.sittingOut.length > 0) {
      const sit = round.sittingOut.map((id) => nameOf(session, id)).join(', ')
      line += ` On the pine: ${sit}. Don't worry — the leaderboard remembers everything.`
    }
    if (round.note?.trim()) {
      line += ` Someone left a round note that said, quote, ${round.note.trim()}, unquote. Bold choice.`
    }
    lines.push(line)
  }
  if (session.rounds.filter((r) => scoredMatches(r).length > 0).length > 4) {
    lines.push(
      `And yes, there were more rounds after that. We truncated for your attention span. The points? Those kept stacking.`,
    )
  }

  // Comments as sarcastic sideline reads
  const matchComments = comments.filter((c) => c.court > 0)
  if (matchComments.length > 0) {
    lines.push(`Sideline hot takes — and I mean that with love and zero respect:`)
    for (const c of matchComments.slice(0, 5)) {
      lines.push(
        `Court ${c.court}, Round ${c.round}, somebody muttered, quote, ${c.text}, unquote. Sure. We'll put that in the podcast.`,
      )
    }
  } else if (comments.length > 0) {
    for (const c of comments.slice(0, 3)) {
      lines.push(
        `Round ${c.round} note from the peanut gallery: quote, ${c.text}, unquote. Noted, filed, lightly mocked.`,
      )
    }
  }

  const leftEarly = standings.filter((s) => !s.active)
  if (leftEarly.length > 0) {
    lines.push(
      `Also: ${leftEarly.map((s) => s.name).join(', ')} dipped early. Points still count. Ghosting the session doesn't ghost the leaderboard.`,
    )
  }
  if (last && champion && last.playerId !== champion.playerId) {
    lines.push(
      `And a moment of silence — well, half a moment — for ${last.name}, finishing with ${last.points} points. Participated enthusiastically. Different partner every round. Nowhere to hide. That's the sport.`,
    )
  }

  if (champion) {
    lines.push(
      `${champion.name} takes the Bangers Americano. ${champion.gamesWon} wins in the book, ${champion.points} points on the board. Wear it proudly. Or smugly. We won't judge. Much.`,
    )
  }
  lines.push(
    `That's the highlight reel. You stay classy, Bangers nation — hydrate, stretch, and maybe don't leave your partner hanging next time. We'll catch you on the next pod.`,
  )

  return lines.join('\n\n')
}

export function championName(standings: Standing[]): string | undefined {
  return standings[0]?.name
}
