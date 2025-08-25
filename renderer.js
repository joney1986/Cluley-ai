const startStopBtn = document.getElementById('startStopBtn');
const getSuggestionBtn = document.getElementById('getSuggestionBtn');
const transcriptDiv = document.getElementById('transcript');
const suggestionsDiv = document.getElementById('suggestions');
const resumeInput = document.getElementById('resume-input');
const jobDescInput = document.getElementById('job-desc-input');

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
                detectQuestionAndSuggest(newText);
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
                        content: questionText
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

async function detectQuestionAndSuggest(text) {
    const trimmedText = text.trim();
    if (!trimmedText) return;

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
                        content: "Does the following sentence contain a question that a person should answer in an interview? Respond with only the single word 'yes' or 'no'."
                    },
                    {
                        role: 'user',
                        content: trimmedText
                    }
                ],
                max_tokens: 3, // Limit response to a few tokens
                temperature: 0.1 // Low temperature for deterministic response
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`OpenAI API Error for intent detection: ${errorData.error.message}`);
        }

        const data = await response.json();
        const intentResponse = data.choices[0].message.content.trim().toLowerCase();

        console.log(`Intent analysis for "${trimmedText}": ${intentResponse}`);

        if (intentResponse.includes('yes')) {
            console.log('Question detected. Classifying question type...');

            const behavioralResponse = await fetch(openaiURL, {
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
                            content: "Is the following a behavioral interview question that asks for a specific story or example? Respond with only the single word 'yes' or 'no'."
                        },
                        {
                            role: 'user',
                            content: trimmedText
                        }
                    ],
                    max_tokens: 3,
                    temperature: 0.1
                })
            });

            if (!behavioralResponse.ok) {
                // Don't throw an error, just log it and proceed with normal suggestion
                console.error('Behavioral detection API call failed.');
            } else {
                const behavioralData = await behavioralResponse.json();
                const behavioralResult = behavioralData.choices[0].message.content.trim().toLowerCase();
                console.log(`Behavioral analysis result: ${behavioralResult}`);

                if (behavioralResult.includes('yes')) {
                    displayStarFramework();
                } else {
                    getInterviewSuggestion(trimmedText);
                }
            } else {
                // If behavioral detection fails, fall back to a normal suggestion.
                getInterviewSuggestion(trimmedText);
            }
        }

    } catch (err) {
        console.error('Error in question detection:', err);
        // We don't show this error in the UI to avoid cluttering the suggestions panel
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
