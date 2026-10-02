HEY JARVIS v3 - talk to Jarvis out loud, powered by Claude

Install or upgrade
1. Right-click hey-jarvis.zip, choose "Extract All", open the folder, double-click "Install Hey Jarvis".
   Already have an older version? Just do the same; it upgrades in place.
2. When it says Done, a blue dot near the clock means Jarvis is listening. It starts by itself at every login.

What Jarvis needs
- Claude Code installed and signed in on this laptop with your own Claude account (run "claude" once in a terminal and log in). If it isn't, Jarvis says "I need Claude Code signed in on this laptop."
- Your claude.ai connectors (Gmail, Google Calendar, Slack, Buffer...) are used automatically when Claude Code is signed in with that same account.
- Internet for Claude and for the natural British voice (without it Jarvis uses the built-in Windows voice).
- OmniRoute is NOT needed. If it happens to be running, Jarvis only uses it as a backup when Claude can't answer. Turn that off with "omniroute_fallback": false in config.json.

Talking to Jarvis
- Say "Hey Jarvis". Jarvis greets you with how the company is doing, then just talk, no wake word needed.
- Ask things like "anything important in my inbox?", "what's on my calendar tomorrow?" or "draft a reply to Sam saying Thursday works".
- Talk over Jarvis any time to cut him off; he stops and listens. (Headphones make this work best.)
- If he needs a few seconds to check something he says "One moment".
- To finish, say "Jarvis off", "turn off", "end conversation", "stop conversation", "that's all", "goodbye" or "go to sleep". He goes quiet and only listens for "Hey Jarvis".
- Go quiet for about 45 seconds and he finishes by himself. Say "Hey Jarvis" again within half an hour and he picks up where you left off.

What Jarvis can and can't do
- Can: read and search your email, calendar, Slack and other connected apps, and write Gmail DRAFTS.
- Can't: send email, delete anything, post or publish (Buffer, Slack, social), buy anything or change accounts. These are blocked in the program itself, not just asked nicely. Nothing goes out unless you send it yourself from your Drafts.

Settings: %LOCALAPPDATA%\HeyJarvis\config.json (open in Notepad)
- "model": "haiku" keeps usage low; "sonnet" is smarter but uses more of your plan.
- "allowed_tools" / "blocked_tools": extra tool names to allow or block (blocked always wins).
- "barge_in", "barge_in_level", "end_silence", "voice". After editing, use Stop and start Hey Jarvis again.

Tray menu (right-click the blue dot): Open Jarvis now, Pause listening, Quit Hey Jarvis.
"Stop Hey Jarvis" stops it for now; "Uninstall Hey Jarvis" removes it completely.

Privacy
- Listening for "Hey Jarvis" and turning your speech into text happen on this laptop. No audio is saved or sent anywhere.
- The words you say (as text) go to Claude through Claude Code on your own account, which may read your connected apps to answer. Replies are spoken by Microsoft's online voice service.
- Jarvis's Claude Code runs in %LOCALAPPDATA%\HeyJarvis\brain, a folder with only his instructions (CLAUDE.md), never your code.
- A short log (no conversation text) is kept in %LOCALAPPDATA%\HeyJarvis\hey_jarvis.log.
