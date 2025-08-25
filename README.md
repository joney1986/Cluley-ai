# Real-Time Transcription and Summarization App

This is a desktop application built with Electron that provides real-time transcription and summarization of your system's audio. It's perfect for transcribing meetings, lectures, or any other live audio, and getting a concise summary at the end.

## Features

- **Real-Time Transcription**: Captures your desktop audio and provides a live transcript.
- **AI-Powered Summarization**: Generates a summary and a list of action items from the transcript using OpenAI's GPT.
- **Stealth Mode**: A toggle to hide the application window from screen captures and screen sharing, ensuring discreet use.
- **Cross-Platform**: Built with Electron, with packaging configured for Linux, and can be extended for Windows and macOS.
- **Invisible**: Listens to system audio without interfering with other applications.

## Getting Started

Follow these instructions to get the project up and running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) installed.

### 1. Installation

Clone the repository and install the dependencies:

```bash
git clone <repository-url>
cd <repository-directory>
npm install
```

### 2. Configuration

This application requires API keys from two services: **AssemblyAI** (for transcription) and **OpenAI** (for summarization).

1.  Open the `renderer.js` file.
2.  Locate the following lines at the top of the file:

    ```javascript
    const ASSEMBLYAI_API_KEY = "YOUR_ASSEMBLYAI_API_KEY";
    const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
    ```

3.  Replace `"YOUR_ASSEMBLYAI_API_KEY"` and `"YOUR_OPENAI_API_KEY"` with your actual API keys.

### 3. Running the Application

To run the application in development mode, use the following command:

```bash
npm start
```

This will launch the application window.

### 4. Building a Distributable Package

To package the application into a distributable file (e.g., an `.AppImage` for Linux), run the following command:

```bash
npm run dist
```

The output file will be located in the `dist/` directory.
