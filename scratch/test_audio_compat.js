import assert from 'assert';
import { audioManager } from '../Scripts/audioManager.js';

console.log("=== Testing AudioManager Dual Mode Compatibility ===");

// 1. Editor mode: queueSound(note, targetTime) with default options
{
    const tapNote = { type: 'tap', isBreak: false, isEx: false, isMine: false };
    const editorTapEvents = audioManager.getSfxEventsForNote(tapNote, 1.0);
    const hasAnswer = editorTapEvents.some(e => e.key === 'answer');
    const hasJudge = editorTapEvents.some(e => e.key === 'judge');
    assert.strictEqual(hasAnswer, true, "Editor MUST receive answer sound for tap notes");
    assert.strictEqual(hasJudge, true, "Editor MUST receive judge sound for tap notes");

    const touchHanabiNote = { type: 'touch', isHanabi: true, holdDuration: 0, _startEffectPlayed: true };
    const editorHanabiEvents = audioManager.getSfxEventsForNote(touchHanabiNote, 2.0);
    const hasHanabi = editorHanabiEvents.some(e => e.key === 'hanabi');
    assert.strictEqual(hasHanabi, true, "Editor MUST receive hanabi sound on touchHanabi note end");
    console.log("✓ Editor mode: queueSound preserves full answer and hanabi events by default");
}

// 2. Play mode: queueHitSound(note, targetTime)
{
    const tapNote = { type: 'tap', isBreak: false, isEx: false, isMine: false };
    const hitTapEvents = audioManager.getSfxEventsForNote(tapNote, 1.0, { includeAnswer: false, includeHanabi: false });
    const hasAnswer = hitTapEvents.some(e => e.key === 'answer');
    const hasJudge = hitTapEvents.some(e => e.key === 'judge');
    assert.strictEqual(hasAnswer, false, "Hit sound MUST NOT include answer (answer plays at note.time in draw())");
    assert.strictEqual(hasJudge, true, "Hit sound MUST include judge feedback");

    const touchHanabiNote = { type: 'touch', isHanabi: true, holdDuration: 0, _startEffectPlayed: false };
    const hitTouchEvents = audioManager.getSfxEventsForNote(touchHanabiNote, 2.0, { includeAnswer: false, includeHanabi: false });
    const hasHanabi = hitTouchEvents.some(e => e.key === 'hanabi');
    const hasTouch = hitTouchEvents.some(e => e.key === 'touch');
    assert.strictEqual(hasHanabi, false, "Hit sound MUST NOT include auto-hanabi (hanabi requires grade !== 'MISS')");
    assert.strictEqual(hasTouch, true, "Hit sound MUST include touch feedback");
    console.log("✓ Play mode: queueHitSound plays pure hit sound without polluting answer or auto-hanabi");
}

console.log("=== All AudioManager compatibility tests PASSED! ===");
