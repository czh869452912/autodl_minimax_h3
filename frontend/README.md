<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# AutoDL H3 frontend

The Prompt Assistant runs its `deepagents/browser` harness and official MiniMax H3 skills entirely inside the Android WebView. The only network request made by the assistant is the user-configured OpenAI-compatible model request.

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Run the UI:
   `npm run dev`

For an APK build, configure the API key, endpoint, and model in the app's System Settings. No agent server or LAN runtime is required.
