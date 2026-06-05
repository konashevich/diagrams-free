# diagrams.free — Contact form (Google Apps Script)

Receives feedback POSTs from https://diagrams.free and sends mail to support@diagrams.free plus a confirmation to the user.

**Script ID:** `1n6SogSwJUS-nn4QYPsOEMmCUk21nfzW1hORbrO1iVoXyRIq-dsdmYLXT`  
**Production web app URL:** `https://script.google.com/macros/s/AKfycbz1MIMuISFRBY2VVqnra60n7PZnOp3a0kQtwnjzPXdgtxU2aXsLtIkt567MzTYSNbKmDw/exec`  
**Deployment ID:** `AKfycbz1MIMuISFRBY2VVqnra60n7PZnOp3a0kQtwnjzPXdgtxU2aXsLtIkt567MzTYSNbKmDw`

Outbound mail uses **From:** `support@diagrams.free` (Gmail → Settings → Accounts → **Send mail as** on `konashevich@gmail.com`).

## One-time authorization (required)

After the first deploy, open the script in the [Apps Script editor](https://script.google.com/d/1n6SogSwJUS-nn4QYPsOEMmCUk21nfzW1hORbrO1iVoXyRIq-dsdmYLXT/edit), select `doPost`, click **Run**, and approve **Gmail send** access. Until this is done, the web app URL returns “Access denied” for anonymous callers.

Verify:

```bash
curl -sL "https://script.google.com/macros/s/AKfycbz1MIMuISFRBY2VVqnra60n7PZnOp3a0kQtwnjzPXdgtxU2aXsLtIkt567MzTYSNbKmDw/exec"
# expect: {"ok":true,"service":"diagrams.free-contact"}
```

## Commands

```bash
cd clasp_projects/diagrams-free-contact
clasp push
clasp version "description"
clasp deploy --description "production"
```

Web app deployment: **Execute as me**, **Anyone** can access. Use the `/exec` URL (not `/dev`).

## Smoke test

```bash
curl -L -X POST "$VITE_APP_CONTACT_FORM_URL" \
  -H "Content-Type: text/plain;charset=utf-8" \
  -d '{"name":"Test","subject":"Hello","email":"you@example.com","message":"Test message"}'
```

Expected: `{"ok":true}`
