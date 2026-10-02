HEY JARVIS v2 - talk to Jarvis out loud

Install or upgrade
1. Right-click hey-jarvis.zip, choose "Extract All", open the folder, double-click "Install Hey Jarvis".
   Already have the old version? Just do the same; it upgrades in place. The first install takes a few minutes (about 300 MB of downloads).
2. When it says Done, a blue dot near the clock means Jarvis is listening. It starts by itself at every login.

Talking to Jarvis
- Say "Hey Jarvis". The Jarvis page opens and Jarvis greets you with how the company is doing: the latest crew updates, what Buzz has posted today, and what is waiting on you.
- Then just talk. No need to say "Hey Jarvis" again; wait for Jarvis to finish speaking before you answer.
- To finish, say "stop", "that's all", "goodbye" or "Hey Jarvis, stop conversation". Jarvis says goodbye and goes back to waiting for "Hey Jarvis".
- If you go quiet for about 45 seconds, Jarvis finishes the conversation by itself.
- Say "Hey Jarvis" again within half an hour and Jarvis remembers what you were talking about.

What Jarvis needs
- OmniRoute running on this laptop (http://localhost:20128). Jarvis uses its free models, never Claude. If OmniRoute is off, Jarvis tells you and still reads you the company headlines.
- Internet for the natural British voice. Without it Jarvis uses the built-in Windows voice.
- If your OmniRoute needs an API key, open %LOCALAPPDATA%\HeyJarvis\config.json in Notepad and put it in "omniroute_key". You can change the models and voice there too. Then use Stop and start Hey Jarvis again (or log out and in).

Tray menu (right-click the blue dot)
- Open Jarvis now, Pause listening, Quit Hey Jarvis.
- "Stop Hey Jarvis" stops it for now; "Uninstall Hey Jarvis" removes it completely.

Privacy
- Listening for "Hey Jarvis" and turning your speech into text both happen on this laptop. No audio is saved or sent anywhere.
- The words you say (as text) go to OmniRoute, which passes them to a free online chat model to work out the answer. Jarvis's reply is turned into speech by Microsoft's online voice service.
- The company status comes from a small public file with crew notes, task titles and post counts only (no emails, money or personal details).
- A short log (no conversation text) is kept in %LOCALAPPDATA%\HeyJarvis\hey_jarvis.log.
