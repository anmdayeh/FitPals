FitTogether — GitHub Pages package (Utterances)

What this package does
- Static single-page app optimized for GitHub Pages.
- Adds a simple local chat stored in browser localStorage **and** the option to enable GitHub-backed comments via Utterances.
- Utterances stores messages as GitHub Issues in the repo you configure (no server required). It is not true WebSocket realtime but updates quickly and works across devices.

How to publish (minimal steps)
1. Create a new GitHub repository (public or private) and push the files from this package to the repo root.
2. In the GitHub repo -> Settings -> Pages -> enable GitHub Pages (choose branch 'main' and folder '/ (root)'). Wait for the site URL to appear.
3. Install the Utterances GitHub App on your repository: https://github.com/apps/utterances (authorize on the repo).
4. Open the Pages URL in a browser. In the page UI:
   - Enter your display name in the Profile card and Save.
   - Enter a group name and click Join.
   - In the GitHub Comments section, enter your repo slug (owner/repo) and click 'Enable GitHub Comments' (first-time posting will create issues in the repo).
5. Open the same Pages URL on another device and repeat — when you open Utterances (embedded), it will show the issue/comments for that page title (group). Comments posted there will be visible across devices.

Notes and tips
- To skip the UI step, you can edit <code>index.html</code> and set the <code>GH_REPO</code> constant near the top to your repo slug (owner/repo) so Utterances loads automatically.
- Utterances uses the page title to map to issues. The app sets the page title to the group name when you join a group. Make sure the group name is identical across devices.
- Utterances stores messages permanently in the GitHub repo's issues. Treat them as public if your repo is public.
- If you'd prefer near-instant realtime without hosting, I can prepare a Firebase-based package instead (client-only).

