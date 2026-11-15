Act as an Expert Full-Stack Developer, IoT Architect, and Hackathon Strategist.

I am participating in a hackathon under the "Immersive Arts" track. The goal is to blend Timișoara’s heritage, public spaces, sound, visuals, and physical elements into an interactive walk-through environment.

I need your help to build the web application and backend architecture for my project: Smart Cultural Lanterns.

Project Essence & User Flow
We are placing smart lanterns (controlled by ESP32 microcontrollers and WiZ smart bulbs, equipped with speakers) in highly populated cultural areas. Each lantern has a unique QR code. The physical lantern is the main character; the web app acts purely as a remote control and entry gate.
Users scan the QR code to connect to the specific lantern, listen to stories from that location, or record their own memories/stories about Timișoara to be played publicly by the lantern.

Current Development Status & Tech Stack
My teammate is handling the hardware (ESP32) using CLion + PlatformIO. I am handling the full-stack web development. I am working on Windows 11 using WSL2 (Ubuntu), utilizing VS Code with the WSL extension to develop both the frontend and backend in parallel.

We have already initialized the projects with the following stack:

Backend: Python + FastAPI. Installed dependencies: fastapi, uvicorn, python-multipart, httpx, google-generativeai, elevenlabs, asyncpg.

Frontend: React + Vite (Vanilla JS). Installed dependencies: @auth0/auth0-react, axios, lucide-react.

Hardware (ESP32): Uses the ESP8266Audio library to play the audio via I2S to a MAX98357A amplifier.

WiZ Bulb Control: The ESP32 controls the WiZ bulb directly via the local network using UDP on port 38899 (WiFiUdp.h). The backend server does NOT talk to the bulb directly.

Hackathon Milestones (Technologies we MUST use & implement)
Vultr: Host the FastAPI backend and serve the generated MP3 files over plain HTTP (crucial for ESP32 download compatibility).

Tiger Data (PostgreSQL): Used via asyncpg as our core database. We will use its time-series metrics to track user presence (frontend pings every 15s) and generate real-time analytics on area crowdedness.

Auth0: Handle user authentication via @auth0/auth0-react. Users can browse anonymously, but login is strictly required to record a story.

Gemini API: Perform a single, powerful API call that receives audio, transcribes it to text, moderates it (rejects profanity/PII/spam), and translates it in one go.

ElevenLabs API: Convert the approved, translated text into high-quality MP3 audio files.

(Optional) Solana: Integrate a lightweight smart contract to log the hashes of approved stories on-chain, acting as an immutable cultural heritage ledger.

System Architecture & Constraints
1. The Web App (The Remote Control)

QR Routing: Scanning the QR code (e.g., /f/unirii) automatically links the user's session to that specific lantern.

Pages Required:

Lantern Page: Shows location name, current live audience count, current story playing, and "Listen" / "Tell a Story" buttons. (No login required).

Listen Page: Choose language, listen to the story on the phone or trigger the lantern. (No login required).

Record Page: Press, speak, submit. (Auth0 login REQUIRED. Must include a public broadcast consent checkbox).

My Stories: List of user's stories with statuses (Processing, Approved, Rejected) and a Delete button.

Moderator Dashboard: For edge-cases requiring manual approval/rejection.

Presence Tracking: The React frontend sends a lightweight "I am here" ping to the FastAPI backend every 15 seconds. If a user closes the page, the backend drops them from the active count after 45 seconds of no pings.

2. The Backend Server (FastAPI on Vultr)

Audio Pipeline: Receives audio (FormData) from React -> Sends to Gemini (Transcription + Moderation + Translation).

Condition: If Gemini rejects it, stop and return the reason to React. If approved, send text to ElevenLabs to get the MP3. Save MP3 on the server. Update the database.

IoT API: Expose a fast, lightweight JSON endpoint for the ESP32. Serve MP3s via static HTTP.

3. The ESP32 Hardware (Strictest Constraints for my teammate)

NO direct API calls to AI: The ESP32 MUST ONLY communicate with the FastAPI backend. It never talks directly to Gemini or ElevenLabs.

Polling: ESP32 asks the backend every 5-10 seconds: "Do I have anything new?".

Payload: The backend responds with a small JSON containing: state (dictates WiZ bulb color/animation over local UDP), people_count, and optionally an audio_url to download and play.

Your Task
I want you to act as my pair programmer. Do not suggest different frameworks; stick strictly to the established stack.

Provide the exact, optimal folder and file structure for both the React project and the FastAPI project.

Outline the SQL schema for Tiger Data (Users, Lanterns, Stories, and Time-Series Presence Pings) so I can initialize the database using asyncpg.

Provide the exact Python code for the most complex backend pipeline in FastAPI: the endpoint that receives the audio file, calls Gemini for the all-in-one analysis, and if approved, calls ElevenLabs, returning the final JSON status.

Ask me a maximum of 3 highly targeted questions about missing technical details so we can start writing the rest of the code.