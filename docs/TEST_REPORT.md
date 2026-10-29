# Test report — 2026-10-29

Environment: macOS (arm64), Node 22.19, Firebase emulators (firebase-tools 15.34, RTDB emulator 4.11.2), Temurin JRE 21. All runs were local. **Nothing was tested against a real Firebase project, school Wi-Fi or real iPads.**

## Automated

| Suite | Command | Result |
|---|---|---|
| Lint | `npm run lint` | ✅ clean |
| Typecheck | `npm run typecheck` | ✅ clean |
| Unit (state machine, room codes, alias/choice validation, result aggregation, content integrity, answer-key leakage) | `npm test` | ✅ 15/15 |
| Security rules in RTDB emulator | `npm run test:rules` | ✅ 62/62 |
| Production build | `npm run build` | ✅ The build was grepped: no answer-key text in `dist/` |

The rules tests cover:
- teacher allowlist and ownership, and that the allowlist and keys cannot be written from a client
- room-code uniqueness and no listing of codes
- **every** status transition pair, allowed and rejected, plus FINISHED being terminal
- stale-`rev` rejection
- no question change while open
- pupils cannot change state, write reveals or write results
- one answer per pupil, with re-submission refused (the reload / duplicate-tab case)
- answers refused when paused, closed, revealed, in the lobby, or for a stale question
- invalid payloads, answering as another uid, and answering without joining
- answer privacy, the roster hidden from pupils, and own-only presence
- alias validation, and no joining a finished or expired session
- reveals readable by participants only

## Simulated load (local emulator, loopback network)

`npm run load:sim -- 2 5 10 30 40`. Each simulated pupil is a separate Firebase client with its own anonymous uid and websocket.

| Pupils | Joined | Answers accepted | Duplicates refused | Late answer while paused refused | Question received p95 | Answer ack p95 |
|---|---|---|---|---|---|---|
| 2 | 2 | 2 | ✅ | ✅ | 20 ms | 8 ms |
| 5 | 5 | 5 | ✅ | ✅ | 9 ms | 10 ms |
| 10 | 10 | 10 | ✅ | ✅ | 6 ms | 12 ms |
| 30 | 30 | 30 | ✅ | ✅ | 11 ms | 22 ms |
| 40 | 40 | 40 | ✅ | ✅ | 10 ms | 22 ms |

These numbers show the logic holds under concurrency. They say **nothing** about school Wi-Fi latency or iPad Safari behaviour.

## Manual (in-app browser, two tabs = teacher + pupil, emulators)

- ✅ Teacher sign-in → create room → code + QR shown.
- ✅ Pupil joins via the `/join?code=` link. The teacher counter updates live (1 joined / 1 online).
- ✅ Start → the pupil receives the question without refreshing. Pupil answers → teacher shows 1/1 answered with correctness hidden.
- ✅ Pupil page reload → same pupil, answer kept, "已提交" shown.
- ✅ Teacher reload → returns to the same room.
- ✅ Close → Reveal → the pupil sees the correct option, "答對了", and the explanation. The teacher sees the distribution and the number correct.
- ✅ Missing image and audio show fallback text (demo bank has empty URLs).

## Not yet verified (needs real devices or credentials)

- ⏳ Real iPad Safari (fonts, tap targets, reload, sleep/wake, Wi-Fi drop).
- ⏳ 2 → 5 → 10 → 30 **physical** devices on school Wi-Fi.
- ⏳ Deployed Firebase project (Hosting, production rules, real Auth).
- ⏳ Projector readability at classroom distance. Full keyboard-only pass of the teacher console. Screen-reader pass.
