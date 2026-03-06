/* BLOOD PRESSURE SIMULATOR - LOGIC */

/* --- CONFIGURATION --- */
const CONFIG = {
    systolic: 120,
    diastolic: 80,
    pulse: 72, // beats per minute
    soundVariation: 5, // Random +/- 5mmHg variation for detection
    maxPressure: 300,
    inflateRate: 0.5,     // mmHg per tick (fast)
    deflateRate: 0.8,   // mmHg per tick (slow)
    gaugeMinAngle: -135,
    gaugeMaxAngle: 135
};

const CONDITIONS = {
    normal: { systolic: 120, diastolic: 80, pulse: 72, intensity: 1.0, description: "Normal (120/80)" },
    hypotension: { systolic: 85, diastolic: 55, pulse: 95, intensity: 0.5, description: "Hypotension (85/55)" },
    prehypertension: { systolic: 130, diastolic: 85, pulse: 72, intensity: 1.0, description: "Pre-Hypertension (130/85)" },
    stage1: { systolic: 150, diastolic: 95, pulse: 80, intensity: 1.5, description: "Hypertension Stage 1 (150/95)" },
    stage2: { systolic: 170, diastolic: 105, pulse: 105, intensity: 2.0, description: "Hypertension Stage 2 (170/105)" },
    crisis: { systolic: 200, diastolic: 130, pulse: 110, intensity: 2.5, description: "Hypertensive Crisis (200/130)" },
    isolated: { systolic: 170, diastolic: 70, pulse: 80, intensity: 2.0, description: "Isolated Systolic Hypertension (170/70)" },
    shock: { systolic: 70, diastolic: 40, pulse: 120, intensity: 0.3, description: "Shock (70/40)" }
};

/* --- STATE --- */
let pumpInterval = null;
const state = {
    step: 0, // 0: Init, 1: Cuff Placed, 2: Steth Placed (Ready)
    pressure: 0,
    isInflating: false,
    isDeflating: false,
    lastBeatTime: 0,
    soundsHeard: {
        systolic: false,
        diastolic: false
    }
};

/* --- DOM ELEMENTS --- */
const dom = {
    // Removed overview elements
    tools: {
        cuff: document.getElementById('tool-cuff'),
        steth: document.getElementById('tool-steth')
    },
    scene: document.getElementById('base-scene'),
    gauge: {
        container: document.getElementById('gauge-container'),
        needle: document.getElementById('gauge-needle'),
        text: document.getElementById('gauge-text')
    },
    controls: document.getElementById('controls'),
    btnInflate: document.getElementById('btn-inflate'),
    btnDeflate: document.getElementById('btn-deflate'),
    log: document.getElementById('results-log'),
    logContent: document.getElementById('log-content'),
    heart: document.getElementById('heart'),
    bpCondition: document.getElementById('bp-condition'),
};

/* --- SCENE ASSETS --- */
const SCENES = {
    empty: 'scene_1.png',
    cuff: 'scene_2.png',
    full: 'scene_3.png'
};

/* --- AUDIO CONTEXT --- */
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

function playKorotkoffSound(intensity = 1) {
    initAudio();

    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    // "Thump" sound synthesis
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(40, t);
    osc.frequency.exponentialRampToValueAtTime(10, t + 0.15);

    // Envelope
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.5 * intensity, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.2);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start(t);
    osc.stop(t + 0.3);
}


/* --- PHYSICS & SIMULATION LOOP --- */
function startLoop() {
    requestAnimationFrame(loop);
}

function loop(timestamp) {
    if (state.step === 2) {
        if (!state.isInflating) updatePressure();

        checkHeartbeat(timestamp);
        updateUI();
    }
    requestAnimationFrame(loop);
}

function updatePressure() {
    if (state.isInflating) {
        // Pump increases pressure
        state.pressure = Math.min(CONFIG.maxPressure, state.pressure + CONFIG.inflateRate);
        state.soundsHeard.systolic = false; // Reset detection logic on re-inflate
        state.soundsHeard.diastolic = false;
    } else if (state.isDeflating) {
        // Valve releases pressure
        state.pressure = Math.max(0, state.pressure - CONFIG.deflateRate);
    }
    // Else pressure stays constant (hold)
}

function checkHeartbeat(now) {
    const beatInterval = 60000 / CONFIG.pulse;

    // Beat timing logic
    if (now - state.lastBeatTime > beatInterval) {
        state.lastBeatTime = now;

        // Korotkoff Logic
        const p = state.pressure;

        // Sound is heard if Pressure is between Systolic and Diastolic
        // The heartbeat must occur only when the pressure is <= systolic and >= diastolic.
        if (!state.isInflating && p <= CONFIG.systolic && p >= CONFIG.diastolic) {
            // Intensity varies based on condition
            const intensity = CONDITIONS[dom.bpCondition.value].intensity;
            playKorotkoffSound(intensity);

            // Needle twitch effect (visual feedback)
            twitchNeedle();

            // Logging Logic
            if (!state.soundsHeard.systolic && Math.abs(p - CONFIG.systolic) <= 5) {
                state.soundsHeard.systolic = true;
                logEvent(`Systolic detected ~${Math.round(p)} mmHg`);
            }
        }

        // End Detection
        // Immediately stop logging after the pressure falls beneath the diastolic value exactly once.
        if (state.soundsHeard.systolic && !state.soundsHeard.diastolic && p < CONFIG.diastolic) {
            state.soundsHeard.diastolic = true;
            logEvent(`Diastolic detected ~${CONFIG.diastolic} mmHg`);
            const condDesc = CONDITIONS[dom.bpCondition.value].description;
            logEvent(`Selected condition: ${condDesc}`);
            logEvent("Measurement Complete.");
        }
    }
}

function twitchNeedle() {
    // Modify visual rotation slightly without changing actual pressure state
    const currentRot = getRotation(state.pressure);
    const twitch = 2; // degrees
    dom.gauge.needle.style.transform = `translate(-50%, -100%) rotate(${currentRot + twitch}deg)`;
    setTimeout(() => {
        dom.gauge.needle.style.transform = `translate(-50%, -100%) rotate(${currentRot}deg)`;
    }, 100);
}

function getRotation(pressure) {
    // Map 0-300 to -135 to +135
    const range = CONFIG.gaugeMaxAngle - CONFIG.gaugeMinAngle;
    const ratio = pressure / CONFIG.maxPressure;
    return CONFIG.gaugeMinAngle + (ratio * range);
}

function updateUI() {
    const rot = getRotation(state.pressure);
    dom.gauge.needle.style.transform = `translate(-50%, -100%) rotate(${rot}deg)`;
    dom.gauge.text.innerText = Math.round(state.pressure);

    const p = state.pressure;

    // START heartbeat at systolic ONLY if not inflating
    if (!state.isInflating && p <= CONFIG.systolic && p >= CONFIG.diastolic) {
        dom.heart.classList.add("beating");
        dom.heart.style.display = "block";
    }
    else {
        dom.heart.classList.remove("beating");
        dom.heart.style.display = "none";
    }
}


function logEvent(msg) {
    const div = document.createElement('div');
    const time = new Date().toLocaleTimeString();
    div.innerText = `[${time}] ${msg}`;
    dom.logContent.prepend(div);
    dom.log.style.display = 'block';
}


/* --- INTERACTION HANDLERS --- */
function setupInteractions() {
    // Select BP Condition
    function applyCondition(val) {
        const cond = CONDITIONS[val];
        CONFIG.systolic = cond.systolic;
        CONFIG.diastolic = cond.diastolic;
        CONFIG.pulse = cond.pulse;

        state.soundsHeard.systolic = false;
        state.soundsHeard.diastolic = false;

        // adjust animation duration so it matches visually
        const beatSec = 60 / cond.pulse;
        dom.heart.style.animationDuration = `${beatSec}s`;

        // PARTIAL MEASUREMENT RESET
        state.pressure = 0;
        state.isInflating = false;
        state.isDeflating = false;
        if (pumpInterval) {
            clearInterval(pumpInterval);
            pumpInterval = null;
        }

        // CLEAR LOGS
        dom.logContent.innerHTML = '';
        dom.log.style.display = 'none';

        // UPDATE UI TO REFLECT ZERO PRESSURE
        updateUI();
    }

    dom.bpCondition.addEventListener('change', (e) => {
        applyCondition(e.target.value);
    });

    // Initialize with default selected condition
    applyCondition(dom.bpCondition.value);

    // Tool: Cuff
    dom.tools.cuff.onclick = (e) => {
        e.stopPropagation();
        if (state.step === 0) {
            state.step = 1;
            dom.tools.cuff.style.display = 'none'; // applied
            dom.scene.src = SCENES.cuff;
        }
    };

    // Tool: Stethoscope
    dom.tools.steth.onclick = (e) => {
        e.stopPropagation();
        if (state.step === 1) {
            state.step = 2;
            dom.tools.steth.style.display = 'none'; // applied
            dom.scene.src = SCENES.full;

            // Show Simulator UI
            dom.gauge.container.style.display = 'block';
            dom.controls.style.display = 'block';

            // Activate Audio Context on user interaction if needed
            initAudio();
        }
    };

    // Controls: Inflate (Mouse/Touch)
    const startInflate = (e) => {
        e.preventDefault();
        state.isInflating = true;

        if (!pumpInterval) {
            pumpInterval = setInterval(() => {
                if (state.isInflating) {
                    updatePressure();
                    updateUI();
                }
            }, 5);
        }
    };

    const stopInflate = (e) => {
        e.preventDefault();
        state.isInflating = false;

        if (pumpInterval) {
            clearInterval(pumpInterval);
            pumpInterval = null;
        }
    };

    dom.btnInflate.addEventListener('mousedown', startInflate);
    dom.btnInflate.addEventListener('mouseup', stopInflate);
    dom.btnInflate.addEventListener('mouseleave', stopInflate);
    dom.btnInflate.addEventListener('touchstart', startInflate);
    dom.btnInflate.addEventListener('touchend', stopInflate);

    // Controls: Deflate (Mouse/Touch)
    const startDeflate = (e) => { e.preventDefault(); state.isDeflating = true; };
    const stopDeflate = (e) => { e.preventDefault(); state.isDeflating = false; };

    dom.btnDeflate.addEventListener('mousedown', startDeflate);
    dom.btnDeflate.addEventListener('mouseup', stopDeflate);
    dom.btnDeflate.addEventListener('mouseleave', stopDeflate);
    dom.btnDeflate.addEventListener('touchstart', startDeflate);
    dom.btnDeflate.addEventListener('touchend', stopDeflate);
    // Mobile Flow Toggle
    const mobileStartBtn = document.getElementById('mobile-start-btn');
    const mobileBackBtn = document.getElementById('mobile-back-btn');

    if (mobileStartBtn) {
        mobileStartBtn.addEventListener('click', () => {
            document.body.classList.remove('mobile-instructions-active');
            // Using scrollIntoView to smoothly show simulator
            dom.scene.scrollIntoView({ behavior: 'smooth' });
        });
    }

    if (mobileBackBtn) {
        mobileBackBtn.addEventListener('click', () => {
            document.body.classList.add('mobile-instructions-active');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }
}


/* --- BOOT --- */
window.onload = () => {
    setupInteractions();
    startLoop();
};
