# Zodiac Ops

Classroom management system — teacher dashboard (`zzzzzz.html`) + student portal (`index.html`).

## Setup for collaborators

### 1. Clone

```bash
git clone https://github.com/jnynlin/cmurx.git
cd cmurx
```

### 2. Create config.js

```bash
cp config.example.js config.js
```

Open `config.js` and fill in the real values (get from project owner — never share via GitHub):

```js
window.ZODIAC_CONFIG = {
    FIREBASE: {
        apiKey:            "...",
        authDomain:        "...",
        databaseURL:       "...",
        projectId:         "...",
        storageBucket:     "...",
        messagingSenderId: "...",
        appId:             "..."
    },
    GAS_URL:    "https://script.google.com/macros/s/.../exec",
    GAS_SECRET: "..."
};
```

### 3. Start a local server

The app uses ES modules (`import`) which require HTTP — opening `file://` directly will not work.

**Option A — Python (no install needed):**
```bash
python3 -m http.server 8080
```

**Option B — Node.js:**
```bash
npx serve .
```

**Option C — VS Code:**
Install the **Live Server** extension, right-click `zzzzzz.html` → *Open with Live Server*.

### 4. Open in browser

| Page | URL |
|---|---|
| Teacher dashboard | `http://localhost:8080/zzzzzz.html` |
| Student portal | `http://localhost:8080/index.html?id=SESSION_ID` |

---

## Files

| File | Purpose |
|---|---|
| `zzzzzz.html` | Teacher dashboard |
| `index.html` | Student portal |
| `gas_sync.gs` | Google Apps Script — paste into Apps Script editor |
| `config.js` | **Gitignored** — local secrets only |
| `config.example.js` | Template for config.js |
| `TECHGUIDE.md` | Full technical reference |

---

## Updating GAS script

1. Open Google Sheets → **Extensions → Apps Script**
2. Replace all code with content of `gas_sync.gs`
3. **Ctrl+S** to save
4. **Deploy → Manage deployments → pencil → Version: New version → Deploy**

The deployment URL stays the same after a version update.
