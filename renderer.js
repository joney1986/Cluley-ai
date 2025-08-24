// IMPORTANT: You must import RecordRTC from the installed package.
// Since we are in a Node.js environment via Electron, we can use require.
const RecordRTC = require('recordrtc');

const startStopBtn = document.getElementById('startStopBtn');
const transcriptDiv = document.getElementById('transcript');
const summaryDiv = document.getElementById('summary');

// --- State Variables ---
let isRecording = false;
let socket;
let recorder;
let stream; // To hold the MediaStream object

// --- AssemblyAI Configuration ---
// IMPORTANT: Replace with your AssemblyAI API key
const ASSEMBLYAI_API_KEY = "YOUR_ASSEMBLYAI_API_KEY";
const assemblyaiURL = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=16000&token=${ASSEMBLYAI_API_KEY}`;

startStopBtn.addEventListener('click', async () => {
    isRecording = !isRecording;
    if (isRecording) {
        startStopBtn.textContent = 'Stop Recording';
        await startRecording();
    } else {
        startStopBtn.textContent = 'Start Recording';
        await stopRecording();
    }
});

const startRecording = async () => {
    transcriptDiv.textContent = 'Connecting...';
    summaryDiv.textContent = '';

    if (!ASSEMBLYAI_API_KEY || ASSEMBLYAI_API_KEY === "YOUR_ASSEMBLYAI_API_KEY") {
        alert("Please replace 'YOUR_ASSEMBLYAI_API_KEY' in renderer.js with your AssemblyAI API key.");
        isRecording = false;
        startStopBtn.textContent = 'Start Recording';
        return;
    }

    try {
        const sources = await window.electronAPI.getSources();
        const screenSource = sources.find(source => source.name === 'Entire screen' || source.name === 'Screen 1');
        if (!screenSource) throw new Error('Screen source not found.');

        stream = await navigator.mediaDevices.getUserMedia({
            audio: { mandatory: { chromeMediaSource: 'desktop' } },
            video: { mandatory: { chromeMediaSource: 'desktop' } }
        });

        socket = new WebSocket(assemblyaiURL);

        socket.onopen = () => {
            console.log('WebSocket connected.');
            transcriptDiv.textContent = 'Capturing audio...';
            recorder = new RecordRTC(stream, {
                type: 'audio',
                mimeType: 'audio/webm;codecs=pcm',
                recorderType: RecordRTC.StereoAudioRecorder,
                timeSlice: 500, // Send data every 500ms
                desiredSampRate: 16000,
                numberOfAudioChannels: 1,
                ondataavailable: (blob) => {
                    const reader = new FileReader();
                    reader.onload = () => {
                        const base64data = reader.result;
                        if (socket.readyState === WebSocket.OPEN) {
                            socket.send(JSON.stringify({ audio_data: base64data.split(',')[1] }));
                        }
                    };
                    reader.readAsDataURL(blob);
                },
            });
            recorder.startRecording();
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.message_type === 'FinalTranscript') {
                 transcriptDiv.textContent += data.text + ' ';
            }
        };

        socket.onerror = (event) => {
            console.error('WebSocket error:', event);
            transcriptDiv.textContent = `WebSocket Error: ${event.message}`;
            stopRecording();
        };

        socket.onclose = () => {
            console.log('WebSocket closed.');
        };

    } catch (err) {
        console.error('Error starting recording:', err);
        transcriptDiv.textContent = `Error: ${err.message}`;
        isRecording = false;
        startStopBtn.textContent = 'Start Recording';
    }
};

// --- OpenAI Configuration ---
// IMPORTANT: Replace with your OpenAI API key
const OPENAI_API_KEY = "YOUR_OPENAI_API_KEY";
const openaiURL = 'https://api.openai.com/v1/chat/completions';

const stopRecording = async () => {
    if (recorder) {
        recorder.stopRecording(() => {
            console.log('Recording stopped.');
        });
        recorder = null;
    }
    if (socket) {
        socket.send(JSON.stringify({ terminate_session: true }));
        socket.close();
        socket = null;
    }
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }

    // --- Trigger Summarization ---
    summaryDiv.textContent = 'Summarizing...';
    const transcriptText = transcriptDiv.textContent;

    if (!transcriptText.trim()) {
        summaryDiv.textContent = 'Nothing to summarize.';
        return;
    }

    if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
        alert("Please replace 'YOUR_OPENAI_API_KEY' in renderer.js with your OpenAI API key to enable summarization.");
        summaryDiv.textContent = 'OpenAI API key not configured.';
        return;
    }

    try {
        const response = await fetch(openaiURL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a helpful assistant that summarizes meeting transcripts. Provide a concise summary and a list of key action items.'
                    },
                    {
                        role: 'user',
                        content: transcriptText
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error: ${errorData.error.message}`);
        }

        const data = await response.json();
        const summary = data.choices[0].message.content;
        summaryDiv.textContent = summary;

    } catch (err) {
        console.error('Error summarizing:', err);
        summaryDiv.textContent = `Summarization Error: ${err.message}`;
    }
};
