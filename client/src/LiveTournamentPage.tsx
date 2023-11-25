import './App.css'
import { ApiMatchOutcome, ApiTournament, SPROutcome } from './api'
import { Box, Typography } from '@mui/material'
import { Match, Tournament } from './Tournament'
import { useCallback, useEffect, useState } from 'react'

const stateConverter = {
  NotStarted: '',
  InProgress: 'IN_PROGRESS',
  Bye: 'WALK_OVER',
  Finished: 'DONE',
}

const convertToEmoji = (choices: SPROutcome[]): string[] => {
  const emojiList = choices.map((choice) => {
    switch (choice) {
      case 'Scissors':
        return '✂️'
      case 'Paper':
        return '📄'
      case 'Rock':
        return '🗿'
      default:
        return 'invalid'
    }
  })
  return emojiList
}

function convertMatches(tournament: ApiTournament): Match[] {
  const matches = tournament.starting_matches.map((apiMatch) => {
    const participants = apiMatch.participants.map((participant) => {
      return {
        id: participant.name,
        name: participant.name,
        isWinner: false,
        resultText: null,
      }
    })

    return {
      id: apiMatch.id,
      nextMatchId: apiMatch.next_match_id,
      tournamentRoundText: apiMatch.tournament_round_text,
      startTime: '',
      state: stateConverter[apiMatch.state],
      participants: participants,
    }
  })

  return matches
}

function LiveTournamentPage() {
  const [matches, setMatches] = useState(null as any)
  const [sock, setSock] = useState(null as WebSocket | null)

  const runMatches = useCallback(() => {
    fetch('/api/tournament', { method: 'POST' }).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
    })
  }, [])

  useEffect(() => {
    const new_sock = new WebSocket('ws://localhost:3000/api/ws')
    setSock(new_sock)
    return () => {
      new_sock.close()
    }
  }, [])

  useEffect(() => {
    if (!sock) {
      return
    }
    sock.onopen = () => {
      console.log('websocket open')
    }
    const onmessage = (e: MessageEvent) => {
      const json = JSON.parse(e.data)
      if (!json) {
        setMatches(null)
      } else if (json['starting_matches']) {
        // First message affter connection is the full tournament state.
        const tournament = json as ApiTournament
        setMatches(convertMatches(tournament))
        for (const matchOutcome of tournament.match_updates) {
          setMatches((matches: Match[]) => {
            return matches.map((match) => {
              if (match.id === matchOutcome.match_id) {
                match.state = stateConverter[matchOutcome.state]
                match.participants = matchOutcome.participants.map((participant) => {
                  return {
                    id: participant.name,
                    name: participant.name,
                    isWinner: participant.winner && match.state !== 'WALK_OVER',
                    resultText: convertToEmoji(participant.moves),
                  }
                })
              }
              return match
            })
          })
        }
      } else {
        // Other messages update specific match states.
        const matchOutcome = json as ApiMatchOutcome
        setMatches((matches: Match[]) => {
          return matches.map((match) => {
            if (match.id === matchOutcome.match_id) {
              match.state = stateConverter[matchOutcome.state]
              match.participants = matchOutcome.participants.map((participant) => {
                return {
                  id: participant.name,
                  name: participant.name,
                  isWinner: participant.winner && match.state !== 'WALK_OVER',
                  resultText: convertToEmoji(participant.moves),
                }
              })
            }
            return match
          })
        })
      }
    }
    const timeoutsToClear: number[] = []
    const onerror = (e: Event) => {
      console.log('Websocket error', e)
      sock.close()
    }
    const onclose = (ev: CloseEvent) => {
      console.log('Websocket closed')
      console.log('Reconnecting in 10s')
      sock.removeEventListener('close', onclose)
      sock.close()
      while (timeoutsToClear.length > 0) {
        const ref = timeoutsToClear.pop()
        clearTimeout(ref)
      }
      const ref = setTimeout(() => {
        setSock(new WebSocket('ws://localhost:3000/api/ws'))
      }, 10000)
      timeoutsToClear.push(ref)
    }
    sock.addEventListener('message', onmessage)
    sock.addEventListener('error', onerror)
    sock.addEventListener('close', onclose)
    return () => {
      for (const ref of timeoutsToClear) {
        clearTimeout(ref)
      }
      sock.removeEventListener('message', onmessage)
      sock.removeEventListener('error', onerror)
      sock.removeEventListener('close', onclose)
    }
  }, [sock])

  return (
    <Box pb={2}>
      <Box py={2}>
        <Typography variant="h3" component={'h2'} sx={{ py: 1, fontSize: '18pt' }}>
          Tournament
        </Typography>
      </Box>
      <button onClick={runMatches}>Run matches</button>
      <Tournament matches={matches} />
    </Box>
  )
}

export default LiveTournamentPage
