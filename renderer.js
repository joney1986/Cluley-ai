const startStopBtn = document.getElementById('startStopBtn');
const getSuggestionBtn = document.getElementById('getSuggestionBtn');
const transcriptDiv = document.getElementById('transcript');
const suggestionsDiv = document.getElementById('suggestions');
const resumeInput = document.getElementById('resume-input');
const jobDescInput = document.getElementById('job-desc-input');
const stealthModeToggle = document.getElementById('stealth-mode-toggle');

// --- State Variables ---
let isRecording = false;
let socket;
let recorder;
let stream; // To hold the MediaStream object
let finalizedTranscript = '';
let currentUtterance = '';

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
    suggestionsDiv.textContent = '';
    finalizedTranscript = '';
    currentUtterance = '';

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
            const RecordRTC = window.electronAPI.RecordRTC;
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
            if (data.message_type === 'PartialTranscript') {
                currentUtterance = data.text;
            } else if (data.message_type === 'FinalTranscript') {
                const newText = data.text;
                finalizedTranscript += newText + ' ';
                currentUtterance = '';
                getSmartSuggestion(newText);
            }
            transcriptDiv.textContent = finalizedTranscript + currentUtterance;
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
    suggestionsDiv.textContent = 'Summarizing...';
    const transcriptText = transcriptDiv.textContent;

    if (!transcriptText.trim()) {
        suggestionsDiv.textContent = 'Nothing to summarize.';
        return;
    }

    if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
        alert("Please replace 'YOUR_OPENAI_API_KEY' in renderer.js with your OpenAI API key to enable summarization.");
        suggestionsDiv.textContent = 'OpenAI API key not configured.';
        return;
    }

    try {
        const resumeText = resumeInput.value;
        const jobDescText = jobDescInput.value;
        const systemPrompt = `You are an expert interview coach. Based on the following resume and job description, provide a personalized and strong answer to the user's question.`;
        const userPrompt = `My resume:\n${resumeText}\n\nJob Description:\n${jobDescText}\n\nQuestion:\n${questionText}`;

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
        suggestionsDiv.textContent = summary;

    } catch (err) {
        console.error('Error summarizing:', err);
        suggestionsDiv.textContent = `Summarization Error: ${err.message}`;
    }
};

async function getInterviewSuggestion(questionText) {
    suggestionsDiv.textContent = 'Generating suggestion...';

    if (!questionText.trim()) {
        suggestionsDiv.textContent = 'There is no text to get a suggestion for.';
        return;
    }

    if (!OPENAI_API_KEY || OPENAI_API_KEY === "YOUR_OPENAI_API_KEY") {
        alert("Please replace 'YOUR_OPENAI_API_KEY' in renderer.js to enable suggestions.");
        suggestionsDiv.textContent = 'OpenAI API key not configured.';
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
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: userPrompt
                    }
                ]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error: ${errorData.error.message}`);
        }

        const data = await response.json();
        const suggestion = data.choices[0].message.content;
        suggestionsDiv.textContent = suggestion;

    } catch (err) {
        console.error('Error getting suggestion:', err);
        suggestionsDiv.textContent = `Suggestion Error: ${err.message}`;
    }
}

getSuggestionBtn.addEventListener('click', async () => {
    const transcriptText = transcriptDiv.textContent;
    getInterviewSuggestion(transcriptText);
});

async function getSmartSuggestion(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    const resumeText = resumeInput.value;
    const jobDescText = jobDescInput.value;

    const systemPrompt = `You are an advanced interview copilot assistant. Your task is to analyze a sentence from an interview transcript and determine the appropriate action. You must return a single JSON object with the following structure:
{
  "is_question": boolean,
  "question_type": "behavioral" | "standard" | "none",
  "response_type": "star_method" | "direct_answer" | "none",
  "response_content": string
}

- Set "is_question" to true if the sentence is a question that requires an answer.
- If it is a question, classify its "question_type". Use "behavioral" if it asks for a story or example (e.g., "Tell me about a time..."). Otherwise, use "standard".
- Based on the type, set the "response_type". For "behavioral" questions, set it to "star_method". For "standard" questions, set it to "direct_answer".
- For a "direct_answer", generate a personalized, strong answer based on the provided resume and job description and put it in "response_content". For all other cases, "response_content" should be an empty string.
- If the sentence is not a question, set "is_question" to false and the other fields to "none" or empty.`;

    const userPrompt = `My resume:\n${resumeText}\n\nJob Description:\n${jobDescText}\n\nInterview Sentence:\n${trimmedText}`;

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
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userPrompt }
                ],
                response_format: { type: "json_object" }
            })
        });

        if (!response.ok) {
            throw new Error(`OpenAI API Error: ${response.statusText}`);
        }

        const data = await response.json();
        const suggestionObject = JSON.parse(data.choices[0].message.content);

        console.log('Received smart suggestion object:', suggestionObject);

        if (suggestionObject.is_question) {
            if (suggestionObject.response_type === 'star_method') {
                displayStarFramework();
            } else if (suggestionObject.response_type === 'direct_answer') {
                suggestionsDiv.textContent = suggestionObject.response_content;
            }
        }
        // If is_question is false, we do nothing.

    } catch (err) {
        console.error('Error getting smart suggestion:', err);
    }
}

function displayStarFramework() {
    suggestionsDiv.innerHTML = `
        <h3>STAR Method for Behavioral Questions</h3>
        <p><strong>S - Situation:</strong> Describe the context. Where and when did this happen?</p>
        <p><strong>T - Task:</strong> What was your specific goal or responsibility?</p>
        <p><strong>A - Action:</strong> What specific steps did <strong>you</strong> take? Use "I" statements.</p>
        <p><strong>R - Result:</strong> What was the outcome? Quantify your success if possible.</p>
    `;
}

stealthModeToggle.addEventListener('change', (event) => {
    const enable = event.target.checked;
    window.electronAPI.setStealthMode(enable);
});
