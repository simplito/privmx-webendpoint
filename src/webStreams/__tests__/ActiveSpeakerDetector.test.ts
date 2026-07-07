import {
    ActiveSpeakerDetector,
    DEFAULTS,
    FrameInput,
    SpeakerState,
} from "../audio/ActiveSpeakerDetector.js";

// ---------------------------------------------------------------------------
// Deterministic test options
//
//   rmsEmaAlpha = 1.0  → emaRms = rms exactly (no smoothing lag)
//   noiseEmaAlpha = 0.0 → noise floor frozen at the value from the first frame
//                         (set by getOrCreateState), so threshold is predictable
//   thresholdOffset = 10 → speaker is active when rms >= noiseFloor + 10
//   holdMs = 200
//   noiseFloorMin = -Infinity → the noise-floor clamp is disabled, so these
//                               deterministic tests use the raw first-frame
//                               value as the floor (they work in small +ve dB)
// ---------------------------------------------------------------------------
const OPTS = {
    rmsEmaAlpha: 1.0,
    noiseEmaAlpha: 0.0,
    thresholdOffset: 10,
    holdMs: 200,
    noiseFloorMin: -Infinity,
};

// Noise floor is established by the first frame for a stream.
// With noiseEmaAlpha=0 it never changes, so threshold = NOISE_FLOOR + 10.
const NOISE_FLOOR = 5;
const ABOVE = NOISE_FLOOR + OPTS.thresholdOffset + 1; // 16: clearly above threshold
const BELOW = NOISE_FLOOR + OPTS.thresholdOffset - 1; // 14: clearly below threshold

function makeDetector() {
    return new ActiveSpeakerDetector(OPTS);
}

function frame(
    detector: ActiveSpeakerDetector,
    id: number,
    rms: number,
    timestamp: number,
): SpeakerState[] {
    return detector.onFrame({ id, rms, timestamp } as FrameInput);
}

function speaker(states: SpeakerState[], id: number): SpeakerState | undefined {
    return states.find((s) => s.streamId === id);
}

/** Returns true when `state` is considered active at the given timestamp. */
function isActive(state: SpeakerState, timestamp: number): boolean {
    return timestamp <= state.activeUntil;
}

// ---------------------------------------------------------------------------

describe("ActiveSpeakerDetector", () => {
    describe("speaking detection", () => {
        it("marks speaker active when emaRms exceeds adaptive threshold", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0); // establishes noise floor
            const states = frame(d, 1, ABOVE, 100);
            expect(isActive(speaker(states, 1)!, 100)).toBe(true);
        });

        it("speaker just below threshold is not active", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            const states = frame(d, 1, BELOW, 100);
            expect(isActive(speaker(states, 1)!, 100)).toBe(false);
        });

        it("speaker at exact threshold boundary (==) is active", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            const atThreshold = NOISE_FLOOR + OPTS.thresholdOffset; // 15
            const states = frame(d, 1, atThreshold, 100);
            expect(isActive(speaker(states, 1)!, 100)).toBe(true);
        });

        it("new speaker starts inactive before any above-threshold frame", () => {
            const d = makeDetector();
            const states = frame(d, 1, NOISE_FLOOR, 0);
            expect(isActive(speaker(states, 1)!, 0)).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // Hold-off - the key behaviour aligned with the Java PR.
    //
    // When speech stops, the speaker should remain active for holdMs (200 ms)
    // and then go silent.  The previous implementation tracked "activeSince"
    // which caused speakers to go *inactive* after 200 ms of *continuous*
    // speech - the opposite of the intended behaviour.
    // -----------------------------------------------------------------------
    describe("holdMs (active period after speech ends)", () => {
        it("speaker stays active for holdMs after the last above-threshold frame", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100); // lastAboveThresholdTs=100, activeUntil=300

            // t=250: 150 ms inside the 200 ms hold window → still active
            const states = frame(d, 1, NOISE_FLOOR, 250);
            expect(isActive(speaker(states, 1)!, 250)).toBe(true);
        });

        it("speaker becomes inactive once holdMs has elapsed since last speech", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100); // activeUntil=300

            // t=301: one millisecond past the hold window → inactive
            const states = frame(d, 1, NOISE_FLOOR, 301);
            expect(isActive(speaker(states, 1)!, 301)).toBe(false);
        });

        it("continuous speech beyond holdMs stays active (regression guard for the hold-logic bug)", () => {
            // The old activeSince-based logic made speakers go inactive after
            // holdMs (200 ms) of *continuous* speech.  Verify that does not happen.
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);

            let states: SpeakerState[] = [];
            let t = 0;
            // 500 ms of continuous speech (> holdMs=200)
            for (t = 100; t <= 600; t += 20) {
                states = frame(d, 1, ABOVE, t); // each frame resets activeUntil
            }
            t -= 20; // last timestamp used
            expect(isActive(speaker(states, 1)!, t)).toBe(true);
        });

        it("each above-threshold frame extends activeUntil", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100); // activeUntil=300
            frame(d, 1, ABOVE, 200); // activeUntil=400

            // t=350: original hold (300) expired, extended hold (400) still valid
            const states = frame(d, 1, NOISE_FLOOR, 350);
            expect(isActive(speaker(states, 1)!, 350)).toBe(true);
        });

        it("activeUntil is exposed on the returned SpeakerState", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            const states = frame(d, 1, ABOVE, 100);
            expect(speaker(states, 1)!.activeUntil).toBe(100 + OPTS.holdMs);
        });
    });

    // -----------------------------------------------------------------------
    describe("multiple speakers", () => {
        it("tracks two speakers independently", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 2, NOISE_FLOOR, 0);

            frame(d, 1, ABOVE, 100); // speaker 1 speaks

            // Process speaker 2 silently - the returned array contains both
            const states = frame(d, 2, NOISE_FLOOR, 100);

            expect(isActive(speaker(states, 1)!, 100)).toBe(true);
            expect(isActive(speaker(states, 2)!, 100)).toBe(false);
        });

        it("both speakers can be active simultaneously", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 2, NOISE_FLOOR, 0);

            frame(d, 1, ABOVE, 100);
            const states = frame(d, 2, ABOVE, 100);

            expect(isActive(speaker(states, 1)!, 100)).toBe(true);
            expect(isActive(speaker(states, 2)!, 100)).toBe(true);
        });

        it("one speaker going silent does not affect the other", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 2, NOISE_FLOOR, 0);

            frame(d, 1, ABOVE, 100);
            frame(d, 2, ABOVE, 100);

            // Only speaker 2 sends frames after t=300 (speaker 1 goes silent)
            // At t=350: speaker 1's activeUntil=300, 350>300 → inactive
            //           speaker 2's activeUntil=250+200=450, 350<450 → active
            frame(d, 2, ABOVE, 250);
            const states = frame(d, 2, NOISE_FLOOR, 350);

            expect(isActive(speaker(states, 1)!, 350)).toBe(false);
            expect(isActive(speaker(states, 2)!, 350)).toBe(true);
        });
    });

    // -----------------------------------------------------------------------
    describe("removeSpeaker", () => {
        it("removed speaker no longer appears in results", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100);

            d.removeSpeaker(1);

            const states = frame(d, 2, NOISE_FLOOR, 150); // trigger a fresh selectActiveSpeakers
            expect(speaker(states, 1)).toBeUndefined();
        });

        it("is a no-op for an unknown speaker id", () => {
            const d = makeDetector();
            expect(() => d.removeSpeaker(999)).not.toThrow();
        });

        it("removed speaker can be re-registered on the next frame", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            d.removeSpeaker(1);

            // Fresh frame for the same id - should create a new state entry
            const states = frame(d, 1, NOISE_FLOOR, 50);
            expect(speaker(states, 1)).toBeDefined();
            expect(isActive(speaker(states, 1)!, 50)).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // `this.speakers`' values are mutated in place every frame; onFrame() must
    // hand out independent, frozen copies so a caller holding a reference from
    // an earlier call never observes a later frame's values through it.
    describe("snapshot immutability", () => {
        it("returns a frozen object that cannot be mutated", () => {
            const d = makeDetector();
            const states = frame(d, 1, ABOVE, 100);

            expect(Object.isFrozen(speaker(states, 1))).toBe(true);
            expect(() => {
                (speaker(states, 1) as unknown as { emaRms: number }).emaRms = 0;
            }).toThrow();
        });

        it("does not change a previously returned snapshot when a later frame updates the same speaker", () => {
            const d = makeDetector();
            const firstCall = frame(d, 1, ABOVE, 100);
            const firstSnapshot = speaker(firstCall, 1)!;
            const emaRmsAtFirstCall = firstSnapshot.emaRms;

            frame(d, 1, ABOVE, 300); // same speaker, later frame

            expect(firstSnapshot.emaRms).toBe(emaRmsAtFirstCall);
        });

        it("returns a new array reference on every call", () => {
            const d = makeDetector();
            const first = frame(d, 1, ABOVE, 100);
            const second = frame(d, 1, ABOVE, 200);

            expect(first).not.toBe(second);
        });
    });

    // -----------------------------------------------------------------------
    describe("noise floor adaptation", () => {
        it("noise floor drops over many silence frames and raises the effective sensitivity", () => {
            // Use DEFAULTS (noiseEmaAlpha=0.02) so the noise floor adapts.
            const d = new ActiveSpeakerDetector(DEFAULTS);

            // Establish a high noise floor with loud background noise
            for (let i = 0; i < 10; i++) {
                d.onFrame({ id: 1, rms: 50, timestamp: i * 10 });
            }

            // Long silence: noise floor adapts downward
            for (let i = 0; i < 300; i++) {
                d.onFrame({ id: 1, rms: 1, timestamp: 200 + i * 10 });
            }

            // A moderate signal (rms=20) that was below the original noiseFloor+6=56
            // threshold but above the adapted threshold (~1+6=7) should become active.
            // With rmsEmaAlpha=0.2 the EMA needs a few frames to climb; send 5.
            let states: SpeakerState[] = [];
            let lastTs = 0;
            for (let i = 0; i < 5; i++) {
                lastTs = 5000 + i * 20;
                states = d.onFrame({ id: 1, rms: 20, timestamp: lastTs });
            }
            expect(isActive(speaker(states, 1)!, lastTs)).toBe(true);
        });

        it("noise floor does not update during above-threshold frames", () => {
            // With DEFAULTS, the noise floor should remain stable while speaking.
            const d = new ActiveSpeakerDetector(DEFAULTS);

            // Warm up with silence to get a stable noise floor near 0
            for (let i = 0; i < 100; i++) {
                d.onFrame({ id: 1, rms: 1, timestamp: i * 10 });
            }

            const stateBeforeSpeech = d.onFrame({ id: 1, rms: 1, timestamp: 1100 });
            const noiseFloorBefore = speaker(stateBeforeSpeech, 1)!.noiseFloor;

            // Now speak loudly - noise floor must not be dragged up
            for (let i = 0; i < 20; i++) {
                d.onFrame({ id: 1, rms: 100, timestamp: 1200 + i * 10 });
            }
            const stateAfterSpeech = d.onFrame({ id: 1, rms: 1, timestamp: 1420 });
            const noiseFloorAfter = speaker(stateAfterSpeech, 1)!.noiseFloor;

            expect(noiseFloorAfter).toBeCloseTo(noiseFloorBefore, 1);
        });
    });

    // -----------------------------------------------------------------------
    // Regression: with native WebRTC audio levels, tracks with no audio report
    // the -99 dB silence value. Without a lower bound the adaptive noise floor
    // pinned there (threshold ~-93 dB), so every track read "active" on the
    // faintest sound and never recovered. noiseFloorMin (DEFAULTS: -70) prevents
    // that. These tests use realistic negative-dB levels and DEFAULTS tuning.
    describe("noiseFloorMin (regression: permanent-active on native silence)", () => {
        const SILENCE = -99;
        const SPEECH = -40;

        function feed(
            d: ActiveSpeakerDetector,
            rms: number,
            count: number,
            startTs: number,
        ): { states: SpeakerState[]; ts: number } {
            let states: SpeakerState[] = [];
            let ts = startTs;
            for (let i = 0; i < count; i++) {
                ts = startTs + i * 300; // 300ms polling cadence
                states = d.onFrame({ id: 1, rms, timestamp: ts });
            }
            return { states, ts };
        }

        it("initializes the noise floor no lower than noiseFloorMin", () => {
            const d = new ActiveSpeakerDetector(DEFAULTS);
            const states = d.onFrame({ id: 1, rms: SILENCE, timestamp: 0 });
            expect(speaker(states, 1)!.noiseFloor).toBe(DEFAULTS.noiseFloorMin);
        });

        it("does not let sustained silence sink the noise floor below noiseFloorMin", () => {
            const d = new ActiveSpeakerDetector(DEFAULTS);
            const { states } = feed(d, SILENCE, 50, 0);
            expect(speaker(states, 1)!.noiseFloor).toBe(DEFAULTS.noiseFloorMin);
        });

        it("marks a speaker active while speaking and inactive again after silence", () => {
            const d = new ActiveSpeakerDetector(DEFAULTS);
            feed(d, SILENCE, 3, 0); // pre-speech silence

            const speaking = feed(d, SPEECH, 6, 900); // ~1.8s of speech
            expect(isActive(speaker(speaking.states, 1)!, speaking.ts)).toBe(true);

            // Long silence afterwards must let the speaker fall inactive - the
            // pre-fix bug left them active forever here.
            const afterSilence = feed(d, SILENCE, 15, speaking.ts + 300);
            expect(isActive(speaker(afterSilence.states, 1)!, afterSilence.ts)).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("stale-speaker pruning", () => {
        it("speaker is pruned after 10 seconds of silence (SPEAKER_PRUNE_AFTER_MS)", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100); // lastAboveThresholdTs=100

            // 10 001 ms after last speech - prune threshold exceeded
            const states = frame(d, 1, NOISE_FLOOR, 10_101);
            expect(speaker(states, 1)).toBeUndefined();
        });

        it("speaker is not pruned at exactly 10 seconds", () => {
            const d = makeDetector();
            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100);

            // Exactly at the prune boundary (10 000 ms) - should still be present
            const states = frame(d, 1, NOISE_FLOOR, 10_100);
            expect(speaker(states, 1)).toBeDefined();
        });

        it("fresh speaker that has never spoken is not pruned (lastAboveThresholdTs = -Infinity)", () => {
            const d = makeDetector();
            // Far-future timestamp - but the speaker has never spoken, so
            // lastAboveThresholdTs = -Infinity and the guard skips it.
            const states = frame(d, 1, NOISE_FLOOR, 100_000);
            expect(speaker(states, 1)).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // Full pipeline (e2e): simulate AudioManager feeding RMS frames into the
    // detector and verify the speaking-stats callback receives correct data.
    // -----------------------------------------------------------------------
    describe("end-to-end: RMS pipeline → speaking stats callback", () => {
        it("callback receives a truthy active state after sustained speech", () => {
            const d = new ActiveSpeakerDetector(OPTS);
            const results: SpeakerState[][] = [];

            // Simulate AudioManager feeding remote RMS frames into the detector
            // (callback = store every result for assertions)
            function simulateRmsFrame(publisherId: number, rms: number, ts: number) {
                results.push(d.onFrame({ id: publisherId, rms, timestamp: ts }));
            }

            const REMOTE_ID = 42;
            simulateRmsFrame(REMOTE_ID, NOISE_FLOOR, 0); // init noise floor
            simulateRmsFrame(REMOTE_ID, ABOVE, 100); // starts speaking
            simulateRmsFrame(REMOTE_ID, ABOVE, 200);
            simulateRmsFrame(REMOTE_ID, ABOVE, 300);

            const latest = results[results.length - 1];
            const s = speaker(latest, REMOTE_ID)!;
            expect(isActive(s, 300)).toBe(true);
            expect(s.activeUntil).toBe(300 + OPTS.holdMs);
        });

        it("callback transitions to inactive after speech ends and hold expires", () => {
            const d = new ActiveSpeakerDetector(OPTS);
            const REMOTE_ID = 7;

            frame(d, REMOTE_ID, NOISE_FLOOR, 0);
            frame(d, REMOTE_ID, ABOVE, 100); // activeUntil=300

            // Hold expires at t=300; check at t=400
            const states = frame(d, REMOTE_ID, NOISE_FLOOR, 400);
            expect(isActive(speaker(states, REMOTE_ID)!, 400)).toBe(false);
        });

        it("two remote streams: only the speaking one is marked active in the callback", () => {
            const d = new ActiveSpeakerDetector(OPTS);

            // Init both streams
            frame(d, 10, NOISE_FLOOR, 0);
            frame(d, 20, NOISE_FLOOR, 0);

            // Stream 10 speaks; stream 20 stays silent
            frame(d, 10, ABOVE, 100);
            const states = frame(d, 20, NOISE_FLOOR, 100);

            expect(isActive(speaker(states, 10)!, 100)).toBe(true);
            expect(isActive(speaker(states, 20)!, 100)).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    describe("configure", () => {
        it("overriding one field leaves the others unchanged", () => {
            const d = makeDetector();
            d.configure({ holdMs: 1000 });

            frame(d, 1, NOISE_FLOOR, 0);
            // thresholdOffset (10) was never touched - BELOW is still inactive.
            const states = frame(d, 1, BELOW, 100);
            expect(isActive(speaker(states, 1)!, 100)).toBe(false);
        });

        it("a holdMs override changes how long a speaker stays active", () => {
            const d = makeDetector();
            d.configure({ holdMs: 1000 });

            frame(d, 1, NOISE_FLOOR, 0);
            frame(d, 1, ABOVE, 100); // activeUntil = 100 + 1000 = 1100

            // t=1050: past the 200ms default hold, well within the 1000ms override.
            const states = frame(d, 1, NOISE_FLOOR, 1050);
            expect(isActive(speaker(states, 1)!, 1050)).toBe(true);
        });

        it("takes effect on the next onFrame(), not retroactively on already-stored state", () => {
            const d = makeDetector(); // rmsEmaAlpha=1.0 (no smoothing lag)
            frame(d, 1, ABOVE, 0); // emaRms = ABOVE

            d.configure({ rmsEmaAlpha: 0 }); // freeze smoothing going forward

            // alpha=0 => emaRms = 0*rms + 1*prevEma - unchanged despite the new rms.
            const states = frame(d, 1, NOISE_FLOOR, 100);
            expect(speaker(states, 1)!.emaRms).toBe(ABOVE);
        });

        it("clamps rmsEmaAlpha to a maximum of 1", () => {
            const d = makeDetector();
            d.configure({ rmsEmaAlpha: 5 }); // unclamped would give 5*16 + (1-5)*5 = 60

            frame(d, 1, NOISE_FLOOR, 0); // emaRms = NOISE_FLOOR (5)
            const states = frame(d, 1, ABOVE, 100);
            expect(speaker(states, 1)!.emaRms).toBe(ABOVE);
        });

        it("clamps a negative noiseEmaAlpha to a minimum of 0", () => {
            const d = makeDetector();
            d.configure({ noiseEmaAlpha: -1 }); // unclamped would give -1*14 + 2*5 = -4

            frame(d, 1, NOISE_FLOOR, 0); // establishes noiseFloor = NOISE_FLOOR (5)
            const states = frame(d, 1, BELOW, 100); // BELOW stays under the update branch
            expect(speaker(states, 1)!.noiseFloor).toBe(NOISE_FLOOR);
        });

        it("clamps holdMs to a minimum of 0", () => {
            const d = makeDetector();
            d.configure({ holdMs: -500 });

            frame(d, 1, NOISE_FLOOR, 0);
            const states = frame(d, 1, ABOVE, 100);
            expect(speaker(states, 1)!.activeUntil).toBe(100);
        });

        it("a noiseFloorMin override raises the floor a new speaker initializes to", () => {
            const d = new ActiveSpeakerDetector(DEFAULTS);
            d.configure({ noiseFloorMin: -50 });

            // First frame is silence (-99); init clamps the floor up to -50.
            const states = d.onFrame({ id: 1, rms: -99, timestamp: 0 });
            expect(speaker(states, 1)!.noiseFloor).toBe(-50);
        });
    });
});
