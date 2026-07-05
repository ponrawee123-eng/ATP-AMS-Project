const fs = require('fs');
const path = require('path');

const projectDir = '/Users/ponrawee/.gemini/antigravity/scratch/personal-ams';
const code = fs.readFileSync(path.join(projectDir, 'js/app_v2.js'), 'utf8');
const lines = code.split('\n');

// Extract block 1 (lines 4038 to 5165, 0-indexed 4037 to 5164)
const block1Lines = lines.slice(4037, 5165);

// Rename initMatchLogView() { to init() {
block1Lines[0] = '    init() {';

let block1Text = block1Lines.join('\n').trim();
if (!block1Text.endsWith(',')) {
    block1Text += ',';
}

// Extract block 2: App.openDetailedMatchReport and App.printDetailedMatchReport
// Lines 5942 to 6393 (0-indexed 5941 to 6393)
const block2Lines = lines.slice(5941, 6393);
let block2Text = block2Lines.join('\n');
block2Text = block2Text.replace(/^App\.openDetailedMatchReport = function\(matchId\) \{/m, '    openDetailedMatchReport(matchId) {');
block2Text = block2Text.replace(/^App\.printDetailedMatchReport = function\(\) \{/m, '    printDetailedMatchReport() {');

// Fix closing brace of openDetailedMatchReport before printDetailedMatchReport
block2Text = block2Text.replace(/\};\s*\n\s*printDetailedMatchReport/g, '},\n\n    printDetailedMatchReport');
// Fix closing brace of printDetailedMatchReport at end (change }; to })
block2Text = block2Text.trim();
if (block2Text.endsWith('};')) {
    block2Text = block2Text.slice(0, -1); // remove semicolon
}

const header = `/* ═══════════════════════════════════════════════════════════════════════
   ATP AMS - MATCH LOGS & TOURNAMENTS MODULE
   ═══════════════════════════════════════════════════════════════════════ */

window.MatchLogModule = {
    editingMatchLogId: null,
    matchLogMode: 'team',

    get liveTracker() {
        return window.LiveTrackerModule ? window.LiveTrackerModule.liveTracker : (window.App ? window.App.liveTracker : null);
    },

    getAthleteDisplayName(ath) {
        if (!ath) return 'Athlete';
        if (window.App && typeof window.App.getAthleteDisplayName === 'function') {
            return window.App.getAthleteDisplayName(ath);
        }
        return ath.nickname || ath.fullName || 'Athlete';
    },
`;

const matchLogJsContent = header + block1Text + '\n\n' + block2Text + '\n};\n';

fs.writeFileSync(path.join(projectDir, 'js/matchLog.js'), matchLogJsContent);
console.log('Created js/matchLog.js successfully! Total lines:', matchLogJsContent.split('\n').length);
