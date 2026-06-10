# Zodiac Ops — Technical Guide

## Stack

| Layer | Technology |
|---|---|
| Frontend | Vue 3 (CDN, Composition API, no build step) |
| Database | Firebase Realtime Database (asia-southeast1) |
| Auth | Firebase Auth — teacher: email/password; students: anonymous |
| Export | Google Apps Script (doPost webhook → Google Sheets) |
| Style | Tailwind CSS (CDN) + Font Awesome 6 |

---

## Files

| File | Role |
|---|---|
| `zzzzzz.html` | Teacher dashboard |
| `index.html` | Student portal |
| `gas_sync.gs` | GAS script — paste into Apps Script editor |

---

## Firebase Config

Project: `cmu-11402-pathophysiology`  
Database URL: `cmu-11402-pathophysiology-default-rtdb.asia-southeast1.firebasedatabase.app`  
Teacher login: `admin@zodiac.com` (password set in Firebase Auth console)

### Security Rules
```json
{
  "rules": {
    "classrooms": {
      "$sessionId": {
        "status":         { ".read": "auth != null", ".write": "auth != null && auth.token.email == 'admin@zodiac.com'" },
        "groupLinks":     { ".read": "auth != null", ".write": "auth != null && auth.token.email == 'admin@zodiac.com'" },
        "assignmentLinks":{ ".read": "auth != null", ".write": "auth != null && auth.token.email == 'admin@zodiac.com'" },
        "students":       { ".read": "auth != null", ".write": "auth != null" }
      }
    }
  }
}
```
Students use `signInAnonymously` — `auth != null` passes. Teacher email/password satisfies the email check.

---

## Data Model

```
classrooms/{sessionId}/
  status/
    loginStatus: "open" | "late" | "locked"
    phaseA:      "waiting" | "warmup" | "interact" | "quiz" | "main_open"
    phaseB:      "waiting" | "submission_open" | "gallery_open" | "final_show"
    config:      { enableGroupA, enableGroupB, assignmentType, enableDiscussion }
    links:       { notebook, slido, forms, assignment, gallery }
    openedAt, closedAt          ← session elapsed timer
    scheduledOpenAt, scheduledCloseAt  ← datetime-local strings (YYYY-MM-DDThh:mm)

  groupLinks[0..11]       ← 討論板 Padlet URLs, indexed by zodiac order
  assignmentLinks[0..11]  ← 繳交 Padlet URLs, indexed by zodiac order

  students/{studentId}/
    profile:  { Name, StudentId, Zodiac, Role, leaderRating }
    auth:     { isActive, token, pin, failedAttempts, lockUntil, loginAt, firebaseUid }
    tasks/
      calibration:  { done, confidence, duration, startTime, endTime }
      notebook:     { done, started, duration, startTime, endTime }
      slido:        { done, started, duration, startTime, endTime }
      forms:        { done, started, duration, startTime, endTime }
      assignment:   { done, started, type, role, contributions[], contributionSubmittedAt, duration }
      gallery:      { done, started }
    rating:   1  (debrief submitted flag — not a score)
    feedback: JSON string { v:1, content, self_score, reflection, leaderRating, leaderSelfReview }
    lastSeen, status
```

---

## Score Calculation

Defined in `SCORE_CONFIG` in `zzzzzz.html`. **`gas_sync.gs` must mirror this exactly.**

| Task | Full score | Speedrun threshold | Penalty |
|---|---|---|---|
| Calibration | 5 | — | — |
| Debrief (rating=1) | 10 | — | — |
| Assignment | 15 | — | — |
| Gallery | 15 | — | — |
| Notebook | 15 | < 15s | 5 |
| Slido | 15 | < 5s | 5 |
| Forms | 25 | < 20s | 10 |
| Leader bonus | max 10 | — | leaderRating × 2 |

- **duration = 0 → full score** (not penalty). Penalty only if `0 < duration < threshold`.
- Max score: member = 100, leader = 110

---

## GAS Integration

### Secret
`CONFIG.GAS_SECRET = "zodiac-2026-cmuh"` in `zzzzzz.html`  
`const GAS_SECRET = "zodiac-2026-cmuh"` in `gas_sync.gs`  
doPost rejects requests where `payload.secret !== GAS_SECRET`.

### Payload sent from zzzzzz.html
```javascript
{
  sessionId: "20260611-XXXX",
  timestamp: Date.now(),
  secret: "zodiac-2026-cmuh",
  rows: [
    {
      studentId, name, zodiac, role,
      calibration, calibration_confidence,
      notebook, notebook_duration,
      slido, slido_duration,
      forms, forms_duration,
      assignment, assignment_role, contributions,
      gallery,
      rating, feedback, self_score, reflection, leader_review,
      leader_rating
    }
  ]
}
```

### GAS Sheet columns (v5.5, 21 cols)
1. 學號 2. 姓名 3. 生肖 4. 總分 5. 連線狀態
6. Group A: 校準 7. 閱讀 8. 互動 9. 測驗 10. 反思
11. Group B: 作業/專案 12. 角色 13. 協作貢獻 14. 展覽完成
15. 心得內容 16. 課末自評分 17. 學習反思 18. 組長領導心得
19. 暖身信心 20. 異常標記 21. 最後連線時間

### Deploying GAS updates
1. Open Google Sheets → **Extensions → Apps Script**
2. Replace all code with latest `gas_sync.gs`
3. **Ctrl+S** to save
4. **Deploy → Manage deployments → pencil → Version: New version → Deploy**
5. URL stays the same — no need to update `zzzzzz.html`

---

## Student Auth Flow

1. `signInAnonymously(auth)` → Firebase anonymous UID
2. Student searches name → `claimingUser` set
3. Student enters 4-digit PIN:
   - First time: PIN written to `auth/pin`; token generated and stored in localStorage
   - Subsequent visits: PIN matched, token verified, 8-hour expiry checked
4. Failed PIN: `failedAttempts` incremented; ≥ 5 → 5-minute `lockUntil`
5. Teacher force-logout: sets `isActive: false, token: null, pin: null`
6. `onDisconnect` sets `auth/isActive: false` → auto-logout on tab close

---

## Session Timer Logic

`setInterval` runs every second in `useClassroom`:
1. If `now >= scheduledCloseAt` and status ≠ locked → auto `setStatus('locked')`
2. If `now >= scheduledOpenAt` and status ≠ open and `now < scheduledCloseAt` → auto `setStatus('open')`

Countdown display priority:
1. Countdown to scheduled close (if open + closeTs in future)
2. Countdown to scheduled open (if not open + openTs in future)
3. Elapsed stopwatch (open since `openedAt`)

---

## Debrief Rules

| State | Score sliders | Text fields |
|---|---|---|
| First submit | Editable | Editable |
| Re-edit | **Locked** (shows locked value) | Editable |
| Re-submit | Original scores preserved | Updated |

`profile/leaderRating` (used for leader bonus score) is written to Firebase on **first submit only**.

---

## Zodiac Order

```
0:子鼠 1:丑牛 2:寅虎 3:卯兔 4:辰龍 5:巳蛇
6:午馬 7:未羊 8:申猴 9:酉雞 10:戌狗 11:亥豬
```
`groupLinks[i]` and `assignmentLinks[i]` map to zodiac index above.

---

## Known Design Choices

- Students can claim a spot even after `loginStatus === 'locked'` (they see locked screen, cannot submit tasks)
- PIN stored as plaintext in Firebase (acceptable for 4-digit temporary classroom use)
- `leaderSelfReview` visible to teacher via GAS col 18 only (not shown in teacher dashboard roster)
- CSV export (`exportToCSV`) is roster-only (学号/姓名/生肖) — scores go to GAS only
