# FitPals — Deployable Web App (v1)

A lightweight group fitness tracker you can deploy on any static host. Features:

- Anonymous sign-in (Firebase Auth).
- Create/join groups with a shared **password** (hashed client-side).
- Log daily meals & exercise; track water/steps.
- Weekly summary table (Excel-style, inspired by your sheet).
- Graphs (Chart.js) with selectable metric and members.
- Group leaderboard (points, streak-friendly).
- Group chat (Firestore realtime).
- Import/Export JSON; CSV export for weekly table.

## 1) Create a Firebase project

1. Go to Firebase console → Create project.
2. Enable **Authentication** → Sign-in method → **Anonymous**.
3. Enable **Cloud Firestore** (in production or test mode).
4. Copy your web app config (API key etc.).

In `index.html`, replace the `window.FITPALS_FIREBASE_CONFIG` placeholder with your config.

## 2) Firestore security rules (recommended baseline)

```bash
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /groups/{groupId} {
      allow read: if true; // groups are discoverable
      allow write: if request.auth != null;

      match /members/{uid} {
        allow read: if true;
        allow write: if request.auth != null && request.auth.uid == uid;
      }

      match /chat/{msgId} {
        allow read: if true;
        allow create: if request.auth != null;
        allow delete, update: if false; // keep immutable in prototype
      }

      match /logs/{logId} {
        allow read: if true;
        allow create, update: if request.auth != null
          && request.resource.data.uid == request.auth.uid;
        allow delete: if false;
      }
    }
  }
}
```

**Note**: Group password is hashed on the client before being stored in `/groups/{groupId}.passwordHash`.

## 3) Local development

- Simply open `index.html` in a modern browser. (Some browsers may restrict module imports via `file://`. If so, run a tiny server:)

```bash
# from this folder
python3 -m http.server 8080
# then open http://localhost:8080
```

## 4) Deploy

- Upload all files to any static host (Firebase Hosting, Netlify, GitHub Pages, Vercel static, S3, etc.).

## 5) Data model

```
groups/{groupId}
  - id
  - passwordHash
  - createdAt

groups/{groupId}/members/{uid}
  - uid, name, joinedAt

groups/{groupId}/chat/{msgId}
  - uid, name, text, ts

groups/{groupId}/logs/{uid}_{YYYY-MM-DD}
  - uid, day, meals[], exercises[], extras[], ts
```

## 6) Extend

- Custom variables: add fields into `extras` (e.g., `{ sweatLoss: 200 }`)—they'll sync and can be charted with small tweaks.
- Photo check-ins: add Firebase Storage and extend logs with photo URLs.
- Streaks: store `lastActive` per user and compute consecutive days server-side if needed.
