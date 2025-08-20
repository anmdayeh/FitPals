FitTogether — Full GitHub Pages package (Utterances)
=======================================================

Included files:
- index.html
- style.css
- app.js
- README.md (this file)
- package.json (optional - not required for GitHub Pages)
- LICENSE (MIT)

Purpose:
This package is intended to be pushed to a GitHub repository and served with GitHub Pages. It uses the Utterances widget to persist group messages to GitHub Issues (no server needed). Local chat is available as a browser fallback (stored in localStorage).

How to deploy:
1. Create a new GitHub repository and push these files to the repo root.
2. Install the Utterances GitHub App on the repo: https://github.com/apps/utterances
3. In the repository settings, enable GitHub Pages (branch: main, folder: / (root)). Wait for the site URL.
4. Open the site, enter your display name, join a group, and enable GitHub Comments by entering the repo slug (owner/repo) and clicking Enable.
5. To post persistent messages, use the Utterances widget that appears under 'Group Chat'. Utterances maps page title to Issue; the app sets the title to the group name when you join a group.

Notes:
- Utterances requires the app to be installed on your repository. First-time comment will create an issue in your repo.
- If your repo is public, comments are public. For private repos, follow Utterances instructions for private repo access.
- If you want true realtime (no server) instead, I can prepare a Firebase version — will require creating a Firebase project but no hosting from you.

