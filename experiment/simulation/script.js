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
    hypotension: { systolic: 90, diastolic: 60, pulse: 90, intensity: 0.8, description: "Hypotension (90/60)" },
    prehypertension: { systolic: 130, diastolic: 85, pulse: 72, intensity: 1.0, description: "Prehypertension (130/85)" },
    stage1: { systolic: 140, diastolic: 90, pulse: 80, intensity: 1.3, description: "Stage 1 Hypertension (140/90)" },
    stage2: { systolic: 160, diastolic: 100, pulse: 90, intensity: 1.6, description: "Stage 2 Hypertension (160/100)" }
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
    btnSelectCuff: document.getElementById('btn-select-cuff'),
    btnSelectSteth: document.getElementById('btn-select-steth'),
    instructionMsg: document.getElementById('instruction-msg'),
    dynamicInstruction: document.getElementById('dynamic-instruction'),
    btnBack: document.getElementById('btn-back'),
    btnReset: document.getElementById('btn-reset'),
    readingSystolic: document.getElementById('reading-systolic'),
    readingDiastolic: document.getElementById('reading-diastolic'),
    btnBackTheory: document.getElementById('btn-back-theory'),
    btnResetTop: document.getElementById('btn-reset-top'),
    btnStartExperiment: document.getElementById('btn-start-experiment')
};

/* --- SCENE ASSETS --- */
const SCENES = {
    empty: 'images\scene_1.png',
    cuff: 'images\scene_2.png',
    full: 'images\scene_3.png'
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

            // Systolic Detection (First sound)
            if (!state.soundsHeard.systolic) {
                state.soundsHeard.systolic = true;
                const systolicVal = Math.round(p);
                logEvent(`Systolic detected: ${systolicVal} mmHg`);
                if (dom.readingSystolic) {
                    dom.readingSystolic.innerText = systolicVal;
                }
            }
        }

        // Diastolic Detection (End Detection)
        // Immediately stop logging after the pressure falls beneath the diastolic value exactly once.
        if (state.soundsHeard.systolic && !state.soundsHeard.diastolic && p < CONFIG.diastolic) {
            state.soundsHeard.diastolic = true;
            const diastolicVal = Math.round(CONFIG.diastolic);
            logEvent(`Diastolic detected: ${diastolicVal} mmHg`);
            if (dom.readingDiastolic) {
                dom.readingDiastolic.innerText = diastolicVal;
            }
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

    // Function to update the dynamic banner
    function updateInstructionBanner(msg) {
        if (dom.dynamicInstruction) {
            dom.dynamicInstruction.innerText = msg;
        }
    }

    // Initialize with default selected condition
    // NOTE: In the new flow, we don't apply automatically on load if we want the user to pick first.
    // However, the existing code calls it. Let's keep it but ensure button is disabled as per HTML.
    applyCondition(dom.bpCondition.value);

    // Initially disable tool clicks
    dom.tools.cuff.style.pointerEvents = 'none';
    dom.tools.steth.style.pointerEvents = 'none';

    if (dom.btnSelectCuff) {
        dom.btnSelectCuff.onclick = () => {
            if (dom.instructionMsg) {
                dom.instructionMsg.innerText = "Click on the cuff to place it on the patient's arm.";
                dom.instructionMsg.style.display = "block";
            }
            updateInstructionBanner("Click on the cuff to place it on the arm.");
            dom.tools.cuff.style.pointerEvents = "auto";
            dom.tools.cuff.classList.add("highlight-tool");
        };
    }

    if (dom.btnSelectSteth) {
        dom.btnSelectSteth.onclick = () => {
            if (dom.instructionMsg) {
                dom.instructionMsg.innerText = "Click on the stethoscope to position it for auscultation.";
                dom.instructionMsg.style.display = "block";
            }
            updateInstructionBanner("Click on the stethoscope to position it for auscultation.");
            dom.tools.steth.style.pointerEvents = "auto";
            dom.tools.steth.classList.add("highlight-tool");
        };
    }

    // Tool: Cuff
    dom.tools.cuff.onclick = (e) => {
        e.stopPropagation();
        if (state.step === 0) {
            state.step = 1;
            dom.tools.cuff.style.display = 'none'; // applied
            dom.tools.cuff.classList.remove('highlight-tool');
            if (dom.instructionMsg) dom.instructionMsg.style.display = 'none';

            // Disable BP condition dropdown
            dom.bpCondition.disabled = true;

            // Show select stethoscope button
            if (dom.btnSelectSteth) dom.btnSelectSteth.style.display = 'block';
            if (dom.btnSelectCuff) dom.btnSelectCuff.style.display = 'none';
            updateInstructionBanner("Now select the stethoscope.");

            dom.scene.src = SCENES.cuff;
        }
    };

    // Tool: Stethoscope
    dom.tools.steth.onclick = (e) => {
        e.stopPropagation();
        if (state.step === 1) {
            state.step = 2;
            dom.tools.steth.style.display = 'none'; // applied
            dom.tools.steth.classList.remove('highlight-tool');
            if (dom.instructionMsg) dom.instructionMsg.style.display = 'none';
            if (dom.btnSelectSteth) dom.btnSelectSteth.style.display = 'none';

            updateInstructionBanner("Setup complete. You may now start the measurement using the manual controls.");

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


    if (dom.btnBack) {
        dom.btnBack.addEventListener('click', () => {
            window.location.href = 'theory.html';
        });
    }

    if (dom.btnBackTheory) {
        dom.btnBackTheory.addEventListener('click', () => {
            window.location.href = 'theory.html';
        });
    }

    const triggerReset = () => {
        // Reset state
        state.step = 0;
        state.pressure = 0;
        state.isInflating = false;
        state.isDeflating = false;
        state.soundsHeard.systolic = false;
        state.soundsHeard.diastolic = false;

        if (pumpInterval) {
            clearInterval(pumpInterval);
            pumpInterval = null;
        }

        // Reset BP condition dropdown
        dom.bpCondition.disabled = false;
        dom.bpCondition.value = "normal";
        applyCondition("normal"); // this also resets some basic states & logs

        // Reset UI readings
        if (dom.readingSystolic) dom.readingSystolic.innerText = "---";
        if (dom.readingDiastolic) dom.readingDiastolic.innerText = "---";

        // Reset tools UI
        dom.tools.cuff.style.display = 'block';
        dom.tools.cuff.classList.remove('highlight-tool');
        dom.tools.cuff.style.pointerEvents = 'none';

        dom.tools.steth.style.display = 'block';
        dom.tools.steth.classList.remove('highlight-tool');
        dom.tools.steth.style.pointerEvents = 'none';

        if (dom.btnSelectCuff) {
            dom.btnSelectCuff.style.display = 'none';
            dom.btnSelectCuff.disabled = false;
        }
        if (dom.btnSelectSteth) dom.btnSelectSteth.style.display = 'none';
        if (dom.btnStartExperiment) dom.btnStartExperiment.style.display = 'block';
        if (dom.instructionMsg) dom.instructionMsg.style.display = 'none';

        // Reset Scene
        dom.scene.src = SCENES.empty;

        // Hide Simulator Controls
        dom.gauge.container.style.display = 'none';
        dom.controls.style.display = 'none';

        // Reset UI Instructions
        updateInstructionBanner("Select a BP condition to begin the experiment.");

        // Reset gauge visuals
        updateUI();
    };

    // Reset Button
    if (dom.btnReset) {
        dom.btnReset.addEventListener('click', triggerReset);
    }
    if (dom.btnResetTop) {
        dom.btnResetTop.addEventListener('click', triggerReset);
    }

    // Start Experiment button
    if (dom.btnStartExperiment) {
        dom.btnStartExperiment.addEventListener('click', () => {
            if (dom.btnSelectCuff) {
                dom.btnSelectCuff.style.display = 'block';
            }
            if (dom.btnStartExperiment) {
                dom.btnStartExperiment.style.display = 'none';
            }
            updateInstructionBanner("Click Select Cuff to place the sphygmomanometer cuff on the patient’s arm.");
        });
    }

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
