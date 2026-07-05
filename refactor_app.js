const fs = require('fs');
const path = require('path');

const projectDir = '/Users/ponrawee/.gemini/antigravity/scratch/personal-ams';
const appPath = path.join(projectDir, 'js/app_v2.js');
let lines = fs.readFileSync(appPath, 'utf8').split('\n');

const proxiesBlock1 = [
    '    initMatchLogView() { if (window.MatchLogModule) window.MatchLogModule.init(); },',
    '    populateMatchLogTeamFilter() { if (window.MatchLogModule) window.MatchLogModule.populateMatchLogTeamFilter(); },',
    '    filterMatchLogAttendance() { if (window.MatchLogModule) window.MatchLogModule.filterMatchLogAttendance(); },',
    '    handleMatchLogIconSelect(inputEl) { if (window.MatchLogModule) window.MatchLogModule.handleMatchLogIconSelect(inputEl); },',
    '    setMatchLogMode(mode) { if (window.MatchLogModule) window.MatchLogModule.setMatchLogMode(mode); },',
    '    renderMatchLogAttendance() { if (window.MatchLogModule) window.MatchLogModule.renderMatchLogAttendance(); },',
    '    renderMatchLogStaff() { if (window.MatchLogModule) window.MatchLogModule.renderMatchLogStaff(); },',
    '    addNewStaffFromLog() { if (window.MatchLogModule) window.MatchLogModule.addNewStaffFromLog(); },',
    '    addNewGameRow(gameData = null) { if (window.MatchLogModule) window.MatchLogModule.addNewGameRow(gameData); },',
    '    toggleGameBoxScore(gameId) { if (window.MatchLogModule) window.MatchLogModule.toggleGameBoxScore(gameId); },',
    '    calcGameBoxScoreEff(gameId) { if (window.MatchLogModule) window.MatchLogModule.calcGameBoxScoreEff(gameId); },',
    '    handleGamePhotoSelect(inputEl, cardId) { if (window.MatchLogModule) window.MatchLogModule.handleGamePhotoSelect(inputEl, cardId); },',
    '    saveMatchLog() { if (window.MatchLogModule) window.MatchLogModule.saveMatchLog(); },',
    '    editMatchLog(id) { if (window.MatchLogModule) window.MatchLogModule.editMatchLog(id); },',
    '    renderMatchHistoryTable() { if (window.MatchLogModule) window.MatchLogModule.renderMatchHistoryTable(); },',
    '    deleteMatchLog(id) { if (window.MatchLogModule) window.MatchLogModule.deleteMatchLog(id); },',
    '    renderTournamentAnalytics() { if (window.MatchLogModule) window.MatchLogModule.renderTournamentAnalytics(); },',
    '    exportMatchLogsToCSV() { if (window.MatchLogModule) window.MatchLogModule.exportMatchLogsToCSV(); },'
];

const proxiesBlock2 = [
    'App.openDetailedMatchReport = function(matchId) {',
    '    if (window.MatchLogModule) window.MatchLogModule.openDetailedMatchReport(matchId);',
    '};',
    '',
    'App.printDetailedMatchReport = function() {',
    '    if (window.MatchLogModule) window.MatchLogModule.printDetailedMatchReport();',
    '};'
];

// Block 1: lines 4038 to 5166 (indices 4037 to 5166)
const start1 = lines.findIndex(l => l.includes('initMatchLogView() {'));
const end1 = lines.findIndex(l => l.includes('initLiveTrackerView() {'));

console.log('Replacing Block 1:', start1 + 1, 'to', end1);
lines.splice(start1, end1 - start1, ...proxiesBlock1);

// Block 2: lines 5942 to 6393 (find by content now after block 1 shift)
const start2 = lines.findIndex(l => l.includes('App.openDetailedMatchReport = function'));
const end2 = lines.findIndex(l => l.includes('App.forceUploadToCloud = async function'));

console.log('Replacing Block 2:', start2 + 1, 'to', end2);
lines.splice(start2, end2 - start2, ...proxiesBlock2);

fs.writeFileSync(appPath, lines.join('\n'));
console.log('Refactored app_v2.js successfully! Total lines:', lines.length);
