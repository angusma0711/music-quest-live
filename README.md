# 音樂王國：失落的四大家族 — Music Quest Live

A teacher-paced, multiplayer music revision game for a Hong Kong P5 music lesson (about 30 pupils on iPads, one teacher on a projector).
The teacher's screen shows a fantasy quest map. Pupils' iPads show one question at a time in Traditional Chinese.
The teacher decides every step: open, pause, close, reveal, next. The software timer never moves the class on.

> **Content notice:** the shipped question bank is a **demo**. It has not been checked against the 4 November lesson scope, the school syllabus or a textbook. Listening questions have no audio yet. See [Replacing content](#replacing-content).

Docs: [Teacher quick-start](docs/QUICKSTART.md) · [4 Nov readiness checklist](docs/READINESS.md) · [Test report](docs/TEST_REPORT.md)

## How it works

| Route | Who | Auth |
|---|---|---|
| `/teacher` | Teacher (projector) | Firebase email/password **and** an entry in the `teachers/{uid}` allowlist (admin-only) |
| `/join` (or `/join?code=XXXXXX` from the QR) | Pupils | Anonymous Firebase auth. Pupils give a nickname or class number only. |

The teacher's session follows this state machine (`src/shared/stateMachine.ts`, enforced again in `database.rules.json`):

```
LOBBY → QUESTION_OPEN ⇄ QUESTION_PAUSED → QUESTION_CLOSED → ANSWER_REVEALED → (next) QUESTION_OPEN | QUEST_COMPLETED | LOBBY
any → FINISHED (terminal)
```

### Architecture

- **React + TypeScript + Vite** static app, with lazy-loaded teacher and pupil bundles.
- **Firebase Realtime Database** holds the live state. **Firebase Auth** handles sign-in. Both run on the free Spark plan, and **no Cloud Functions or billing are needed**.
- Trust model: `database.rules.json` is the server-side authority. It enforces:
  - Only an allowlisted teacher can create a session, and only the session's owner can change it.
  - Status changes must follow the transition table. The question can only change when opening from LOBBY, REVEALED or QUEST_COMPLETED. Every write must have `rev = rev + 1`, so a stale second tab is rejected.
  - Answers are accepted only from a joined participant, only while `status == QUESTION_OPEN`, only for the current `questionId`, at most once (`!data.exists()`), with `0 ≤ choice < optionCount`, and with a server timestamp.
  - Pupils can read only their own answers and their own participant record. They cannot list rooms, the roster, other pupils' answers or results.
- **Answer keys are never shipped to pupils.**
  - `src/content/demoBank.ts` (public, bundled) contains no answers.
  - Answers live in `content/answer-keys.demo.json`, which is uploaded to `answerKeys/demo`. Only allowlisted teachers can read that path.
  - On reveal, the teacher's client copies one question's key into `sessionReveals/{room}/{qid}`. It also writes the class aggregate to `sessionResults`.
  - A unit test checks that the public bank has no answer fields, and the build was grepped to confirm the keys are absent.
- Listeners stay small. Pupils subscribe to the session node, their own answer and the current reveal. The teacher subscribes to the roster, presence and the *current* question's answers.
- Reconnection:
  - Anonymous auth persists in Safari, so a reload gets the same uid, the same participant record and the already-submitted answer.
  - Duplicate tabs share that uid, and the rules refuse a second answer.
  - Presence uses `onDisconnect`. The teacher's room id is kept in `localStorage`, so a teacher reload returns to the same room.
- Room codes:
  - 6 characters from a 31-symbol unambiguous alphabet (about 887M combinations), generated with `crypto.getRandomValues`.
  - Uniqueness is enforced by the rules (`!data.exists()`).
  - Codes can only be looked up one at a time, never listed. They are deleted when the session ends, and joining is refused 12 h after creation.

#### Known limits (no server code by design)
- **The teacher client is trusted** to copy the correct key on reveal and to compute results. Pupils cannot tamper with either.
- **No per-room size cap or rate limiting.** RTDB rules cannot count children. Before wide use, consider Firebase **App Check** and Auth abuse quotas. A Cloud Function join gate would require the paid **Blaze** plan, so it is not enabled.
- A guessed room code lets someone join as an anonymous pupil. The code is shown only in class, and the teacher sees the joined count. Ending the session invalidates the code.

## Local development (no Firebase project needed)

Requirements: Node 20.19+ (22 LTS recommended), and Java 11+ for the Firebase emulators.

```bash
npm install
```

```bash
npm run emulators          # terminal 1: Auth + Realtime DB emulators (ports 9099/9000, UI on 4000)
```

```bash
npm run seed:emulator      # terminal 2: creates teacher@example.test / music-quest-dev + allowlist + demo answer keys
```

```bash
npm run dev                # terminal 3: http://localhost:5173/teacher  and  /join
```

The emulators listen on `0.0.0.0`, so iPads on the same Wi-Fi can open `http://<laptop-ip>:5173/join` for a real-device test. Emulator data is wiped when it stops: re-run `seed:emulator` each time.

### Scripts

| Script | Purpose |
|---|---|
| `npm run check` | lint + typecheck + unit tests + production build |
| `npm test` | unit tests (state machine, validation, content integrity) |
| `npm run test:rules` | security-rule tests in the RTDB emulator (needs Java) |
| `npm run load:sim -- 2 5 10 30` | N simulated pupils against a running, seeded emulator; writes `load-report.json` |

## Deploying to Firebase (needs your action)

Nothing has been deployed. Everything below is free on the Spark plan.

1. Create a Firebase project in the [console](https://console.firebase.google.com/). Add a **Web app** and a **Realtime Database** (choose the `asia-southeast1` region for Hong Kong).
2. **Authentication → Sign-in method**: enable **Email/Password** and **Anonymous**. Add a teacher user under **Users**.
3. Copy `.env.example` to `.env.local`. Set `VITE_USE_EMULATORS=false` and fill in the web-config values. These values are public; the rules provide the security.
4. `cp .firebaserc.example .firebaserc`, then put in your project id.
5. Allowlist the teacher, using the uid shown on `/teacher` after sign-in:

    ```bash
    npx firebase database:set /teachers/TEACHER_UID --data true
    ```

6. Upload the answer keys:

    ```bash
    npx firebase database:set /answerKeys/demo content/answer-keys.demo.json
    ```

7. Deploy:

    ```bash
    npm run check && npx firebase deploy --only database,hosting
    ```

## Replacing content

1. Edit `src/content/demoBank.ts`. Quests and questions are typed, and `kind` is one of `choice | image | listening | rhythm | reflection`. Keep `id`s unique and stable. Set `demo: false` and a new `id`/`title` once the content is confirmed.
2. Put each answer in `content/answer-keys.<bankId>.json` as `{ "<questionId>": { "correct": <0-based index or null>, "explanation": "…" } }`. **Never** put answers in `src/`.
3. Images and audio: put licensed files in `public/images/` or `public/audio/` and reference them as `/images/x.jpg`. Audio plays **only on the teacher's screen**. Pupil iPads never autoplay. Missing or broken media shows a fallback and does not block the lesson.
4. Run `npm test`. It checks that every question has a key, that keys are in range, and that no answers leaked into the public bank. Then re-upload the keys (step 6 above).

## Privacy

- Pupils give only a nickname or class number (1–12 characters). Values containing `@`, `<` or `>` are rejected.
- No email, full name or school data is collected, and there is no export of individual pupil data. The results page shows class totals only.
