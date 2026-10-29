# 4 November readiness checklist

## Content (teacher)
- [ ] Confirm the lesson scope, then edit `src/content/demoBank.ts` and set `demo: false`.
- [ ] Fill in `correct` and `explanation` for every question in the answer-key JSON. The listening questions currently have `correct: null`.
- [ ] Add licensed audio and images (`public/audio`, `public/images`). Test each on the projector speakers.
- [ ] Run `npm test`, then re-upload the answer keys.

## Platform (once)
- [ ] Firebase project created. Email/Password and Anonymous sign-in enabled (README → Deploying).
- [ ] Teacher uid allowlisted. Answer keys uploaded. Rules and hosting deployed. Note the real HTTPS link.
- [ ] Check that the school Wi-Fi or firewall allows `*.firebaseio.com` websockets and `*.web.app` / `*.firebaseapp.com`.

## Rehearsal (before the lesson)
- [ ] 2 iPads + projector: join → answer → pause → reveal → next.
- [ ] Reload Safari on one iPad mid-question and confirm the answer is kept.
- [ ] Turn one iPad's Wi-Fi off and on again.
- [ ] Ideally 10, then about 30 iPads at once in the real classroom. **30-device reliability on school Wi-Fi has not been measured yet.**
- [ ] Projector: check font size from the back row. Browser zoom (⌘ +) is fine.

## Lesson day
- [ ] Laptop charged, signed in at `/teacher`, room created before pupils arrive.
- [ ] Printed copy of the questions, plus A/B/C/D cards or paper slips (fallback).
- [ ] Spare plan for listening items, e.g. play the audio from a phone or demonstrate live.

## Fallback if the network fails 網絡失效後備方案
1. Keep the teacher screen on the projector. If the laptop has the questions loaded, keep going in **Waiting screen** or read from the printed sheet.
2. Pupils answer with **hand signals** (1–4 fingers = A–D) or **A/B/C/D cards / paper slips**.
3. Count roughly by show of hands, then reveal and explain as usual. The learning loop (listen → respond → feedback → explain/perform) still works without devices.
4. If the network comes back, press **End** and start a **New session**, then continue from the next question by tapping that quest on the map.
