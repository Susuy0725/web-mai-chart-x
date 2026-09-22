import { getSlideJudgeQueue, PREDEFINED_SLIDE_CONSTANTS } from '../_play/slidetables.js';

console.log('Testing SlideTable Constants...');
console.assert(PREDEFINED_SLIDE_CONSTANTS['circle2'] === 0.465, 'circle2 const check');
console.assert(PREDEFINED_SLIDE_CONSTANTS['line3'] === 0.182, 'line3 const check');
console.assert(PREDEFINED_SLIDE_CONSTANTS['v1'] === 0.185, 'v1 const check');
console.assert(PREDEFINED_SLIDE_CONSTANTS['s'] === 0.13, 's const check');

console.log('Testing getSlideJudgeQueue...');
const testNote = { pos: 1, slideEnd: 5, slideType: '-', slideDelay: 0.5, slideDuration: 1.0 };
const queue = getSlideJudgeQueue(testNote);
console.log('Queue length:', queue.length, 'tableConst:', queue.tableConst);
console.assert(queue.length > 0, 'queue length > 0');
console.assert(queue.tableConst === 0.152, 'line5 const check');

console.log('All unit checks in test_judge.js PASSED!');
