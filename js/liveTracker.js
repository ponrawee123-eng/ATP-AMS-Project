/**
 * ═══════════════════════════════════════════════════════════════════════════
 *  LIVE STAT TRACKER MODULE (js/liveTracker.js)
 *  MacBook Air M4 Keyboard & Trackpad Courtside Command Console.
 * ═══════════════════════════════════════════════════════════════════════════
 */
window.LiveTrackerModule = {
    liveTracker: null,
    _liveTrackerKeybound: false,
    _subModeActive: false,
    _oppKeyPending: false,
    _oppTimeout: null,

    init() {
        if (!this._liveTrackerKeybound) {
            document.addEventListener('keydown', (e) => this.handleLiveTrackerKeydown(e));
            this._liveTrackerKeybound = true;
        }

        // Load existing session or set defaults
        const savedSession = localStorage.getItem('atp_live_tracker_session');
        if (savedSession) {
            try {
                this.liveTracker = JSON.parse(savedSession);
            } catch(e) {
                this.resetLiveTrackerState();
            }
        } else {
            this.resetLiveTrackerState();
        }

        this.populateLiveTrackerMatches();
        this.syncLiveTrackerUI();
    },

    getLiveTrackerAthletes() {
        const allAthletes = window.Store.getAthletesOnly();
        if (!this.liveTracker || !this.liveTracker.matchId) return allAthletes;

        const matchId = this.liveTracker.matchId;
        let targetAthleteIds = null;
        let match = null;

        if (matchId.startsWith('sp_')) {
            const realId = matchId.replace('sp_', '');
            const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
            match = seasonMatches.find(m => m.id === realId);
        } else if (this.liveTracker.periodizationMatchId) {
            const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
            match = seasonMatches.find(m => m.id === this.liveTracker.periodizationMatchId);
        }

        if (!match && matchId !== 'new') {
            const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
            match = logs.find(l => l.id === matchId);
        }

        if (match) {
            let ids = [];
            if (Array.isArray(match.attendedAthleteIds)) ids.push(...match.attendedAthleteIds);
            if (Array.isArray(match.athleteIds)) ids.push(...match.athleteIds);
            if (Array.isArray(match.roster)) ids.push(...match.roster);
            if (Array.isArray(match.squad)) ids.push(...match.squad);
            if (Array.isArray(match.assignedAthletes)) ids.push(...match.assignedAthletes);
            if (Array.isArray(match.athletes)) ids.push(...match.athletes);
            if (Array.isArray(match.games)) {
                match.games.forEach(g => {
                    if (Array.isArray(g.playerStats)) {
                        g.playerStats.forEach(ps => {
                            if (ps.athleteId) ids.push(ps.athleteId);
                        });
                    }
                });
            }
            if (ids.length > 0) {
                targetAthleteIds = [...new Set(ids)];
            }
        }

        if (targetAthleteIds && targetAthleteIds.length > 0) {
            const filtered = allAthletes.filter(a => targetAthleteIds.includes(a.id));
            if (filtered.length > 0) return filtered;
        }

        if (this.liveTracker && this.liveTracker.gameDayRosterIds && this.liveTracker.gameDayRosterIds.length > 0) {
            const filtered = allAthletes.filter(a => this.liveTracker.gameDayRosterIds.includes(a.id));
            if (filtered.length > 0) return filtered;
        }

        return allAthletes;
    },

    resetLiveTrackerState() {
        let athletes = this.getLiveTrackerAthletes();
        if (!athletes || athletes.length === 0) athletes = window.Store.getAthletesOnly();
        
        // Ensure exactly 5 court slots exist
        const initialOnCourt = [];
        for (let i = 0; i < 5; i++) {
            if (athletes[i]) {
                initialOnCourt.push(athletes[i].id);
            } else {
                const placeholderId = `mps_court_player_${i + 1}`;
                initialOnCourt.push(placeholderId);
            }
        }
        
        this.liveTracker = {
            matchId: 'new',
            teamName: 'MPS',
            oppName: 'Opponent',
            quarter: 'Q1',
            scoreTeam: 0,
            scoreOpp: 0,
            teamFouls: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT: 0 },
            oppFouls: { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT: 0 },
            selectedAthleteId: initialOnCourt[0] || '',
            onCourtIds: initialOnCourt,
            playerStats: {},
            oppStats: { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 },
            quarterScores: { Q1: { team: 0, opp: 0 }, Q2: { team: 0, opp: 0 }, Q3: { team: 0, opp: 0 }, Q4: { team: 0, opp: 0 }, OT: { team: 0, opp: 0 } },
            pbpEvents: [],
            // === Transition Fail-Safe State Machine (Feature 2) ===
            ourTransitionActive: false,
            oppTransitionActive: false,
            // === PTS From Turnovers — generic backend keys (Feature 1) ===
            our_pts_from_to: 0,
            opp_pts_from_to: 0,
            // === Roster cap for game mode (Feature 7) ===
            gameMode: '5x5',
            selectedRosterIds: []
        };

        athletes.forEach(a => {
            this.liveTracker.playerStats[a.id] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
        });
    },

    populateLiveTrackerMatches() {
        const select = document.getElementById('live-tracker-match-select');
        if (!select) return;
        select.innerHTML = '<option value="new">+ Create New Session</option>';

        // 1. Season Planner Scheduled Fixtures
        const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
        if (seasonMatches.length > 0) {
            const groupOpt = document.createElement('optgroup');
            groupOpt.label = '📅 Season Planner Scheduled Fixtures';
            seasonMatches.forEach(m => {
                const opt = document.createElement('option');
                opt.value = `sp_${m.id}`;
                opt.textContent = `${m.name || 'Match'} (${m.date || 'TBD'}) - vs ${m.opponent || m.venue || 'Opponent'}`;
                groupOpt.appendChild(opt);
            });
            select.appendChild(groupOpt);
        }

        // 2. Saved Match Logs
        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        if (logs.length > 0) {
            const groupOpt2 = document.createElement('optgroup');
            groupOpt2.label = '📊 Match Log Saved Tournaments';
            logs.forEach(l => {
                const opt = document.createElement('option');
                opt.value = l.id;
                opt.textContent = `${l.title} (${l.date}) - vs ${l.opponent}`;
                groupOpt2.appendChild(opt);
            });
            select.appendChild(groupOpt2);
        }

        if (this.liveTracker && this.liveTracker.matchId) {
            select.value = this.liveTracker.matchId;
        }
    },

    setLiveTrackerMatch() {
        const select = document.getElementById('live-tracker-match-select');
        if (!select) return;
        const val = select.value;
        this.liveTracker.matchId = val;

        if (val.startsWith('sp_')) {
            const realId = val.replace('sp_', '');
            const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
            const match = seasonMatches.find(m => m.id === realId);
            if (match) {
                const oppInput = document.getElementById('live-tracker-opp-name');
                const oppName = match.opponent || match.name || 'Opponent';
                if (oppInput) oppInput.value = oppName;
                this.liveTracker.oppName = oppName;
                this.liveTracker.periodizationMatchId = realId;
                window.WellnessModule.showToast(`📅 Linked to Season Planner Fixture: ${match.name}`, 'success');
            }
        } else if (val !== 'new') {
            const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
            const match = logs.find(l => l.id === val);
            if (match) {
                const oppInput = document.getElementById('live-tracker-opp-name');
                if (oppInput && match.opponent) oppInput.value = match.opponent;
                this.liveTracker.oppName = match.opponent || 'Opponent';
                window.WellnessModule.showToast(`Linked session to ${match.title}`, 'info');
            }
        }

        // Adjust on-court players if selecting a match with specific roster
        const rosterAthletes = this.getLiveTrackerAthletes();
        if (rosterAthletes && rosterAthletes.length > 0) {
            const newOnCourt = [];
            for (let i = 0; i < 5; i++) {
                if (rosterAthletes[i]) {
                    newOnCourt.push(rosterAthletes[i].id);
                } else if (this.liveTracker.onCourtIds && this.liveTracker.onCourtIds[i]) {
                    newOnCourt.push(this.liveTracker.onCourtIds[i]);
                }
            }
            this.liveTracker.onCourtIds = newOnCourt;
            if (!newOnCourt.includes(this.liveTracker.selectedAthleteId)) {
                this.liveTracker.selectedAthleteId = newOnCourt[0];
            }
        }

        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    launchLiveTrackerForMatch(seasonMatchId) {
        const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
        const match = seasonMatches.find(m => m.id === seasonMatchId);
        
        // Switch view to Live Stat Tracker
        const liveNav = document.querySelector('[data-view="live-tracker-view"]');
        if (liveNav) liveNav.click();

        if (match) {
            this.liveTracker.oppName = match.opponent || match.name || 'Opponent';
            this.liveTracker.periodizationMatchId = seasonMatchId;
            this.liveTracker.matchId = `sp_${seasonMatchId}`;

            if (match.atpScore !== undefined && match.atpScore !== null) this.liveTracker.scoreTeam = match.atpScore;
            if (match.oppScore !== undefined && match.oppScore !== null) this.liveTracker.scoreOpp = match.oppScore;
            if (match.currentQuarter) this.liveTracker.quarter = match.currentQuarter;
            if (match.stage) this.liveTracker.quarter = match.stage;
            
            const oppInput = document.getElementById('live-tracker-opp-name');
            if (oppInput) oppInput.value = this.liveTracker.oppName;

            this.populateLiveTrackerMatches();
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast(`🏀 Live Stat Tracker launched for Season Planner fixture: ${match.name}!`, 'success');
        }
    },

    setLiveTrackerQuarter() {
        const qtrSelect = document.getElementById('live-tracker-quarter-select');
        if (qtrSelect && this.liveTracker) {
            this.liveTracker.quarter = qtrSelect.value;
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast(`Switched Quarter to ${qtrSelect.value}`, 'info');
        }
    },

    autoSyncLiveTrackerToLinkedMatch() {
        if (!this.liveTracker) return;
        const matchId = this.liveTracker.matchId;
        const spId = this.liveTracker.periodizationMatchId || (matchId && matchId.startsWith('sp_') ? matchId.replace('sp_', '') : null);

        // 1. Sync to Season Planner Match in real-time
        if (spId && window.Store.getMatches) {
            const seasonMatches = window.Store.getMatches();
            const spMatch = seasonMatches.find(m => m.id === spId);
            if (spMatch) {
                spMatch.atpScore = this.liveTracker.scoreTeam || 0;
                spMatch.oppScore = this.liveTracker.scoreOpp || 0;
                spMatch.currentQuarter = this.liveTracker.quarter || 'Q1';
                spMatch.stage = this.liveTracker.quarter || 'Q1';
                spMatch.liveTrackerState = {
                    scoreTeam: this.liveTracker.scoreTeam || 0,
                    scoreOpp: this.liveTracker.scoreOpp || 0,
                    quarter: this.liveTracker.quarter || 'Q1',
                    teamFouls: this.liveTracker.teamFouls,
                    oppFouls: this.liveTracker.oppFouls
                };
                window.Store.saveMatch(spMatch);
                if (window.PeriodizationModule && typeof window.PeriodizationModule.renderMatches === 'function') {
                    window.PeriodizationModule.renderMatches();
                }
            }
        }

        // 2. Sync to Match Log entry in real-time
        if (matchId && matchId !== 'new' && !matchId.startsWith('sp_')) {
            const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
            const logIndex = logs.findIndex(l => l.id === matchId);
            if (logIndex > -1) {
                logs[logIndex].atpScore = this.liveTracker.scoreTeam || 0;
                logs[logIndex].oppScore = this.liveTracker.scoreOpp || 0;
                logs[logIndex].stage = this.liveTracker.quarter || 'Q1';
                localStorage.setItem('atp_match_logs', JSON.stringify(logs));
                if (window.App && typeof window.App.renderMatchLogs === 'function') {
                    window.App.renderMatchLogs();
                }
            }
        }
    },

    saveLiveTrackerSession() {
        if (!this.liveTracker) return;
        const teamNameInput = document.getElementById('live-tracker-team-name');
        const oppNameInput = document.getElementById('live-tracker-opp-name');
        const qtrSelect = document.getElementById('live-tracker-quarter-select');

        if (teamNameInput) this.liveTracker.teamName = teamNameInput.value.trim() || 'MPS';
        if (oppNameInput) this.liveTracker.oppName = oppNameInput.value.trim() || 'Opponent';
        if (qtrSelect) this.liveTracker.quarter = qtrSelect.value;

        localStorage.setItem('atp_live_tracker_session', JSON.stringify(this.liveTracker));
        this.autoSyncLiveTrackerToLinkedMatch();
    },

    syncLiveTrackerUI() {
        if (!this.liveTracker) return;

        // Scoreboard
        const teamLabel = document.getElementById('live-tracker-team-label');
        const oppLabel = document.getElementById('live-tracker-opp-label');
        const teamScore = document.getElementById('live-tracker-team-score');
        const oppScore = document.getElementById('live-tracker-opp-score');
        const qtrLabel = document.getElementById('live-tracker-quarter-label');
        const qtrSelect = document.getElementById('live-tracker-quarter-select');

        if (teamLabel) teamLabel.textContent = this.liveTracker.teamName || 'MPS';
        if (oppLabel) oppLabel.textContent = this.liveTracker.oppName || 'OPPONENT';
        if (teamScore) teamScore.textContent = this.liveTracker.scoreTeam || 0;
        if (oppScore) oppScore.textContent = this.liveTracker.scoreOpp || 0;
        if (qtrLabel) qtrLabel.textContent = this.liveTracker.quarter || 'Q1';
        if (qtrSelect && this.liveTracker.quarter) qtrSelect.value = this.liveTracker.quarter;

        this.renderLiveTrackerOnCourt();
        this.renderLiveTrackerBench();
        this.renderLiveTrackerPbpFeed();
    },

    renderLiveTrackerOnCourt() {
        const grid = document.getElementById('live-tracker-on-court-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const athletes = this.getLiveTrackerAthletes();
        const rawOnCourt = (this.liveTracker.onCourtIds || []).slice(0, 5);
        while (rawOnCourt.length < 5) {
            rawOnCourt.push(`mps_court_slot_${rawOnCourt.length + 1}`);
        }
        this.liveTracker.onCourtIds = rawOnCourt;

        const onCourtAthletes = rawOnCourt.map((id, idx) => {
            const found = athletes.find(a => a.id === id);
            if (found) return found;
            return { id: id, fullName: `Court Player #${idx + 1}`, nickname: `P#${idx + 1}`, jerseyNumber: '' };
        });

        const playerKeyLetters = ['Q', 'W', 'E', 'R', 'T'];
        onCourtAthletes.forEach((ath, idx) => {
            const hotkeyLetter = playerKeyLetters[idx] || (idx + 1);
            const stats = this.liveTracker.playerStats[ath.id] || { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, eff: 0 };
            const isSelected = this.liveTracker.selectedAthleteId === ath.id;

            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.setAttribute('data-athlete-id', ath.id);
            card.style = `padding: 12px; position: relative; border-radius: 10px; border: 2px solid ${isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.12)'}; background: ${isSelected ? 'rgba(0, 150, 255, 0.12)' : 'rgba(255,255,255,0.03)'}; box-shadow: ${isSelected ? '0 0 18px rgba(0, 150, 255, 0.3)' : 'none'}; transition: all 0.2s ease; cursor: pointer;`;
            card.onclick = () => {
                this.liveTracker.selectedAthleteId = ath.id;
                this.syncLiveTrackerUI();
            };

            const photoUrl = ath.photo || ath.photoData || null;
            let photoHtml = photoUrl 
                ? `<img src="${photoUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-blue); flex-shrink: 0;">`
                : `<div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.12); display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 1.15rem; color: var(--accent-blue); flex-shrink: 0;">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'P')}</div>`;

            const displayName = window.App && typeof window.App.getAthleteDisplayName === 'function' ? window.App.getAthleteDisplayName(ath) : (ath.nickname || ath.fullName);

            card.innerHTML = `
                <div style="position: absolute; top: 8px; right: 8px; background: var(--accent-orange); color: #000; font-weight: 900; font-size: 0.78rem; padding: 2px 7px; border-radius: 4px; font-family: monospace; box-shadow: 0 0 6px rgba(245,158,11,0.4);">
                    [Key ${hotkeyLetter}]
                </div>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                    ${photoHtml}
                    <div style="min-width: 0; flex-grow: 1;">
                        <div style="font-weight: 800; font-size: 0.98rem; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                            ${displayName}
                        </div>
                        <div style="font-size: 0.74rem; color: var(--text-muted); cursor: pointer; margin-top: 1px;" onclick="event.stopPropagation(); window.LiveTrackerModule.editAthleteJerseyNumber('${ath.id}')" title="Click to edit Jersey #">
                            Jersey: <strong style="color: var(--accent-blue); font-size: 0.82rem;">${ath.jerseyNumber ? '#' + ath.jerseyNumber : '-'}</strong> <i class="fas fa-edit" style="font-size: 0.65rem; color: var(--text-muted); margin-left: 3px;"></i>
                        </div>
                    </div>
                </div>
                <!-- Live Stats Badge Counter -->
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; text-align: center; margin-bottom: 8px; font-size: 0.70rem;">
                    <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">PTS</span>
                        <strong style="color: var(--accent-orange); font-size: 0.90rem;">${stats.pts}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">REB</span>
                        <strong style="color: var(--text-primary); font-size: 0.84rem;">${stats.reb || 0} <small style="font-size: 0.58rem; color: var(--accent-blue);">(${stats.oreb || 0}/${stats.dreb || 0})</small></strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">AST</span>
                        <strong style="color: var(--text-primary); font-size: 0.84rem;">${stats.ast || 0}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">PF</span>
                        <strong style="color: ${stats.pf >= 5 ? '#EF4444' : (stats.pf === 4 ? '#F59E0B' : 'var(--text-primary)')}; font-size: 0.84rem;">${stats.pf || 0}/5</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">+/-</span>
                        <strong style="color: ${stats.pm > 0 ? '#10B981' : (stats.pm < 0 ? '#EF4444' : 'var(--text-muted)')}; font-size: 0.84rem;">${stats.pm > 0 ? '+' + stats.pm : (stats.pm || 0)}</strong>
                    </div>
                </div>

                <!-- Trackpad Fallback Quick Action Buttons -->
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;" onclick="event.stopPropagation()">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', '2')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(16, 185, 129, 0.2); border-color: #10B981; color: #10B981;" title="+2 PTS Made">+2</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'c')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #EF4444;" title="2PT Missed">2Miss</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', '3')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(16, 185, 129, 0.2); border-color: #10B981; color: #10B981;" title="+3 PTS Made">+3</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'v')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #EF4444;" title="3PT Missed">3Miss</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', '1')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(16, 185, 129, 0.2); border-color: #10B981; color: #10B981;" title="+1 FT Made">+1FT</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'g')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(239, 68, 68, 0.15); border-color: rgba(239, 68, 68, 0.4); color: #EF4444;" title="FT Missed">FTMiss</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-top: 4px;" onclick="event.stopPropagation()">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'd')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Defensive Rebound (Key D)">DREB</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'o')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #10B981;" title="Offensive Rebound (Shift+D)">OREB</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'a')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Assist (Key A)">AST</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 's')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Steal (Key S)">STL</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'b')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Block (Key B)">BLK</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'k')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; color: #F59E0B;" title="Turnover (Key K)">TO</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerCardAction('${ath.id}', 'x')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; color: #EF4444; border-color: ${stats.pf >= 4 ? '#EF4444' : 'rgba(239, 68, 68, 0.4)'}" title="Personal Foul (Key X)">Foul</button>
                </div>
            `;
            grid.appendChild(card);
        });

        // 6th Card: OPPONENT TEAM CARD (Slot O)
        const isOppSelected = this.liveTracker.selectedAthleteId === 'opponent_team_card';
        const oppStats = this.liveTracker.oppStats || { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0 };
        const oppName = this.liveTracker.oppName || 'OPPONENT';

        const oppCard = document.createElement('div');
        oppCard.className = 'glass-panel';
        oppCard.setAttribute('data-athlete-id', 'opponent_team_card');
        oppCard.style = `padding: 12px; position: relative; border-radius: 10px; border: 2px solid ${isOppSelected ? 'var(--accent-orange)' : 'rgba(245, 158, 11, 0.4)'}; background: ${isOppSelected ? 'rgba(245, 158, 11, 0.18)' : 'rgba(245, 158, 11, 0.04)'}; box-shadow: ${isOppSelected ? '0 0 18px rgba(245, 158, 11, 0.4)' : 'none'}; transition: all 0.2s ease; cursor: pointer;`;
        oppCard.onclick = () => {
            this.liveTracker.selectedAthleteId = 'opponent_team_card';
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast(`Selected Opponent Team [Key O]: ${oppName}`, 'warning');
        };

        oppCard.innerHTML = `
            <div style="position: absolute; top: 8px; right: 8px; background: #F59E0B; color: #000; font-weight: 900; font-size: 0.78rem; padding: 2px 7px; border-radius: 4px; font-family: monospace; box-shadow: 0 0 6px rgba(245,158,11,0.4);">
                [Key O]
            </div>
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 8px;">
                <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(245, 158, 11, 0.2); border: 2px solid #F59E0B; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.15rem; color: #F59E0B; flex-shrink: 0;">
                    <i class="fas fa-shield-alt"></i>
                </div>
                <div style="min-width: 0; flex-grow: 1;">
                    <div style="font-weight: 800; font-size: 0.98rem; color: var(--accent-orange); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                        ${oppName}
                    </div>
                    <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 1px;">
                        Rival Team (Opponent)
                    </div>
                </div>
            </div>

            <!-- Opponent Live Stats Counters -->
            <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; text-align: center; margin-bottom: 8px; font-size: 0.70rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                    <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">PTS</span>
                    <strong style="color: var(--accent-orange); font-size: 0.90rem;">${oppStats.pts || 0}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                    <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">REB</span>
                    <strong style="color: var(--text-primary); font-size: 0.84rem;">${oppStats.reb || 0} <small style="font-size: 0.58rem; color: var(--accent-blue);">(${oppStats.oreb || 0}/${oppStats.dreb || 0})</small></strong>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                    <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">AST</span>
                    <strong style="color: var(--text-primary); font-size: 0.84rem;">${oppStats.ast || 0}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                    <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">PF</span>
                    <strong style="color: ${oppStats.pf >= 5 ? '#EF4444' : 'var(--text-primary)'}; font-size: 0.84rem;">${oppStats.pf || 0}</strong>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 3px 1px; border-radius: 4px;">
                    <span style="color: var(--text-muted); display: block; font-size: 0.60rem; font-weight: bold;">TO</span>
                    <strong style="color: #F59E0B; font-size: 0.84rem;">${oppStats.to || 0}</strong>
                </div>
            </div>

            <!-- Opponent Trackpad Buttons -->
            <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;" onclick="event.stopPropagation()">
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('2')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(234, 58, 42, 0.2); border-color: var(--accent-orange); color: var(--accent-orange);" title="+2 PTS Made">+2</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('w')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(255,255,255,0.05); color: var(--text-muted);" title="2PT Missed">2Miss</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('3')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(234, 58, 42, 0.2); border-color: var(--accent-orange); color: var(--accent-orange);" title="+3 PTS Made">+3</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('e')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(255,255,255,0.05); color: var(--text-muted);" title="3PT Missed">3Miss</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('1')" style="font-size: 0.74rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(234, 58, 42, 0.2); border-color: var(--accent-orange); color: var(--accent-orange);" title="+1 FT Made">+1FT</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('g')" style="font-size: 0.70rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(255,255,255,0.05); color: var(--text-muted);" title="FT Missed">FTMiss</button>
            </div>
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 3px; margin-top: 4px;" onclick="event.stopPropagation()">
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('d')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Defensive Rebound">DREB</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('o')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; background: rgba(16, 185, 129, 0.15); border-color: rgba(16, 185, 129, 0.4); color: #10B981;" title="Offensive Rebound">OREB</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('a')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Assist">AST</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('s')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Steal">STL</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('b')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center;" title="Block">BLK</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('k')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; color: #F59E0B;" title="Turnover">TO</button>
                <button type="button" class="btn btn-secondary btn-sm" onclick="window.LiveTrackerModule.handleLiveTrackerOpponentAction('x')" style="font-size: 0.68rem; font-weight: bold; padding: 4px 1px; justify-content: center; border-color: rgba(239, 68, 68, 0.4); color: #EF4444;" title="Personal Foul">Foul</button>
            </div>
        `;
        grid.appendChild(oppCard);
    },

    renderLiveTrackerBench() {
        const grid = document.getElementById('live-tracker-bench-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const athletes = this.getLiveTrackerAthletes();
        const benchAthletes = athletes.filter(a => !(this.liveTracker.onCourtIds || []).includes(a.id));

        if (benchAthletes.length === 0) {
            grid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">All roster athletes are on court.</div>';
            return;
        }

        benchAthletes.forEach((ath, idx) => {
            const benchKeyNum = idx + 1;
            const isSubPending = this._subModeActive;
            const badgeBg = isSubPending ? 'background: #F59E0B; color: #000;' : 'background: rgba(245, 158, 11, 0.2); color: #F59E0B;';
            const badgeText = isSubPending ? `[ PRESS ${benchKeyNum % 10} ]` : `#${benchKeyNum % 10}`;

            const card = document.createElement('div');
            card.style = `background: ${isSubPending ? 'rgba(245, 158, 11, 0.18)' : 'rgba(255,255,255,0.02)'}; border: 2px solid ${isSubPending ? '#F59E0B' : 'rgba(255,255,255,0.06)'}; box-shadow: ${isSubPending ? '0 0 15px rgba(245, 158, 11, 0.5)' : 'none'}; border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; cursor: pointer; flex-shrink: 0; min-width: 160px; position: relative; transition: all 0.2s ease;`;
            card.title = 'Click or press number to sub into 5 on-court';
            card.onclick = () => this.substituteLiveTrackerPlayer(ath.id);

            const photoUrl = ath.photo || ath.photoData || null;
            let photoHtml = photoUrl
                ? `<img src="${photoUrl}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);">`
                : `<div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem; color: var(--accent-orange);">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'B')}</div>`;

            const jerseyDisplay = ath.jerseyNumber ? `#${ath.jerseyNumber}` : '#?';

            card.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px; min-width: 0; flex-grow: 1;">
                    ${photoHtml}
                    <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                        ${ath.nickname || ath.fullName}
                        <span onclick="event.stopPropagation(); window.LiveTrackerModule.editAthleteJerseyNumber('${ath.id}')" style="color: var(--accent-orange); font-weight: bold; background: rgba(245, 158, 11, 0.15); padding: 1px 5px; border-radius: 4px; font-size: 0.68rem; border: 1px solid rgba(245, 158, 11, 0.3); cursor: pointer; margin-left: 4px;" title="Click to edit Jersey #">
                            ${jerseyDisplay}
                        </span>
                    </div>
                </div>
                <div style="${badgeBg} font-weight: 900; font-size: ${isSubPending ? '0.72rem' : '0.68rem'}; padding: 2px 6px; border-radius: 4px; font-family: monospace; letter-spacing: 0.5px; flex-shrink: 0;">
                    ${badgeText}
                </div>
            `;
            grid.appendChild(card);
        });
    },

    substituteLiveTrackerPlayer(benchAthleteId) {
        if (!this.liveTracker) return;
        const selectedId = this.liveTracker.selectedAthleteId;
        const onCourtIndex = this.liveTracker.onCourtIds.indexOf(selectedId);

        if (onCourtIndex > -1) {
            const oldId = this.liveTracker.onCourtIds[onCourtIndex];
            this.liveTracker.onCourtIds[onCourtIndex] = benchAthleteId;
            this.liveTracker.selectedAthleteId = benchAthleteId;
            
            const athletes = this.getLiveTrackerAthletes();
            const oldAth = athletes.find(a => a.id === oldId);
            const newAth = athletes.find(a => a.id === benchAthleteId);

            this.addLiveTrackerPbpEvent({
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                text: `SUB: ${newAth ? (newAth.nickname || newAth.fullName) : benchAthleteId} IN for ${oldAth ? (oldAth.nickname || oldAth.fullName) : oldId}`
            });
            window.WellnessModule.showToast('Player substituted into 5 on-court!', 'info');
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
        } else {
            window.WellnessModule.showToast('Click an active player card first, then click bench player to swap!', 'warning');
        }
    },

    triggerCardActionFx(athleteId, popupText, fxType) {
        const grid = document.getElementById('live-tracker-on-court-grid');
        if (grid) {
            const cards = Array.from(grid.children);
            const targetCard = cards.find(card => card.getAttribute('data-athlete-id') === athleteId) || 
                               cards[this.liveTracker.onCourtIds.indexOf(athleteId)];

            if (targetCard) {
                targetCard.classList.remove('card-flash-green', 'card-flash-red', 'card-flash-blue');
                void targetCard.offsetWidth;
                
                const flashClass = (fxType === 'green') ? 'card-flash-green' : ((fxType === 'red') ? 'card-flash-red' : 'card-flash-blue');
                targetCard.classList.add(flashClass);
                
                const popup = document.createElement('div');
                popup.className = `floating-stat-popup fx-${fxType}`;
                popup.textContent = popupText;
                targetCard.appendChild(popup);
                
                setTimeout(() => { popup.remove(); }, 850);
            }
        }

        const hud = document.getElementById('live-tracker-hud-banner');
        if (hud) {
            hud.textContent = popupText;
            hud.style.display = 'block';
            hud.classList.remove('live-tracker-hud-banner');
            void hud.offsetWidth;
            hud.classList.add('live-tracker-hud-banner');
            setTimeout(() => { hud.style.display = 'none'; }, 1500);
        }

        const scoreBadge = document.getElementById('live-tracker-score-badge');
        if (scoreBadge) {
            scoreBadge.textContent = popupText.split('!')[0].split('(')[0].trim();
            scoreBadge.style.display = 'inline-block';
            const badgeColor = fxType === 'green' ? '#10B981' : (fxType === 'red' ? '#EF4444' : '#0090FF');
            scoreBadge.style.color = badgeColor;
            scoreBadge.style.borderColor = badgeColor;
            scoreBadge.style.background = fxType === 'green' ? 'rgba(16, 185, 129, 0.2)' : (fxType === 'red' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(0, 144, 255, 0.2)');
            setTimeout(() => { scoreBadge.style.display = 'none'; }, 1200);
        }
    },

    handleLiveTrackerCardAction(athleteId, action) {
        if (!this.liveTracker) return;
        
        // SHOT CHART INTERCEPTION
        if (this.liveTracker.shotChartEnabled && ['2', 'c', 'w', '3', 'e', 'v'].includes(action)) {
            this.openShotLocationModal((zoneName) => {
                this.executeLiveTrackerCardAction(athleteId, action, zoneName);
            });
            return; // Pause execution until user clicks a zone
        }

        this.executeLiveTrackerCardAction(athleteId, action, null);
    },

    executeLiveTrackerCardAction(athleteId, action, zoneName) {
        if (!this.liveTracker) return;
        const stats = this.liveTracker.playerStats[athleteId] || { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, pm: 0, eff: 0 };
        const athletes = this.getLiveTrackerAthletes();
        const ath = athletes.find(a => a.id === athleteId);
        const name = ath ? (ath.nickname || ath.fullName) : athleteId;

        let deltaPts = 0;
        let desc = '';
        let fxText = '';
        let fxType = 'green';

        if (action === '2') {
            stats.pts += 2;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg2m += 1;
            stats.fg2a += 1;
            deltaPts = 2;
            desc = `+2 PTS (2PT Made) by ${name}`;
            fxText = `🔥 +2 PTS MADE! (${name})`;
            fxType = 'green';
        } else if (action === 'w' || action === 'c') {
            stats.fga += 1;
            stats.fg2a += 1;
            desc = `2PT Missed by ${name}`;
            fxText = `❌ 2PT MISSED (${name})`;
            fxType = 'red';
        } else if (action === '3') {
            stats.pts += 3;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg3m += 1;
            stats.fg3a += 1;
            deltaPts = 3;
            desc = `+3 PTS (3PT Made) by ${name}`;
            fxText = `🔥 +3 PTS MADE! (${name})`;
            fxType = 'green';
        } else if (action === 'e' || action === 'v') {
            stats.fga += 1;
            stats.fg3a += 1;
            desc = `3PT Missed by ${name}`;
            fxText = `❌ 3PT MISSED (${name})`;
            fxType = 'red';
        } else if (action === '1' || action === 'f') {
            stats.pts += 1;
            stats.ftm += 1;
            stats.fta += 1;
            deltaPts = 1;
            desc = `+1 FT Made by ${name}`;
            fxText = `🎯 +1 FT MADE (${name})`;
            fxType = 'green';
        } else if (action === 'g') {
            stats.fta += 1;
            desc = `FT Missed by ${name}`;
            fxText = `❌ FT MISSED (${name})`;
            fxType = 'red';
        } else if (action === 'd') {
            stats.dreb = (stats.dreb || 0) + 1;
            stats.reb = (stats.oreb || 0) + stats.dreb;
            desc = `Defensive Rebound by ${name}`;
            fxText = `🛡️ DEF REBOUND (${name})`;
            fxType = 'blue';
        } else if (action === 'o') {
            stats.oreb = (stats.oreb || 0) + 1;
            stats.reb = stats.oreb + (stats.dreb || 0);
            desc = `Offensive Rebound by ${name}`;
            fxText = `🏀 OFF REBOUND (${name})`;
            fxType = 'green';
        } else if (action === 'r') {
            stats.dreb = (stats.dreb || 0) + 1;
            stats.reb = (stats.oreb || 0) + stats.dreb;
            desc = `Rebound by ${name}`;
            fxText = `🏀 REBOUND (${name})`;
            fxType = 'blue';
        } else if (action === 'a') {
            stats.ast = (stats.ast || 0) + 1;
            desc = `Assist by ${name}`;
            fxText = `🎯 ASSIST (${name})`;
            fxType = 'blue';
        } else if (action === 's') {
            stats.stl = (stats.stl || 0) + 1;
            desc = `Steal by ${name}`;
            fxText = `⚡ STEAL (${name})`;
            fxType = 'blue';
            // === TRANSITION FAIL-SAFE: OUR Steal = Opponent's TO ===
            // If opponent's transition window was already open, the steal reverses it to ours
            if (this.liveTracker.oppTransitionActive) {
                this.liveTracker.oppTransitionActive = false;
                this.liveTracker.ourTransitionActive = true;
                window.WellnessModule.showToast(`⚡ STEAL reverses transition! ${this.liveTracker.teamName || 'OUR'} window OPEN`, 'success');
            } else if (!this.liveTracker.ourTransitionActive) {
                // Steal opens our transition and auto-credits opponent with a TO
                if (!this.liveTracker.oppStats) this.liveTracker.oppStats = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
                this.liveTracker.oppStats.to = (this.liveTracker.oppStats.to || 0) + 1;
                this.liveTracker.ourTransitionActive = true;
                window.WellnessModule.showToast(`⚡ STEAL! ${this.liveTracker.teamName || 'OUR'} TRANSITION WINDOW OPEN 🟢`, 'success');
            }
            // If ourTransitionActive was already true: steal just credits the player, no double-TO
        } else if (action === 'b') {
            stats.blk = (stats.blk || 0) + 1;
            desc = `Block by ${name}`;
            fxText = `🛡️ BLOCK (${name})`;
            fxType = 'blue';
        } else if (action === 't' || action === 'k') {
            stats.to = (stats.to || 0) + 1;
            desc = `Turnover by ${name}`;
            fxText = `⚠️ TURNOVER (${name})`;
            fxType = 'orange';
            // === TRANSITION FAIL-SAFE: OUR TO — opens OPPONENT's transition window ===
            if (this.liveTracker.ourTransitionActive) {
                // Turnover-over-Turnover Chaos Logic
                this.liveTracker.ourTransitionActive = false;
                this.liveTracker.oppTransitionActive = true;
                window.WellnessModule.showToast(`⚠️ CHAOS! OUR TO reverses transition to ${this.liveTracker.oppName || 'OPP'}`, 'warning');
            } else if (!this.liveTracker.oppTransitionActive) {
                this.liveTracker.oppTransitionActive = true;
                window.WellnessModule.showToast(`⚠️ TURNOVER! ${this.liveTracker.oppName || 'OPP'} TRANSITION WINDOW OPEN 🔴`, 'warning');
            }
        } else if (action === 'x') {
            stats.pf = (stats.pf || 0) + 1;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.teamFouls) this.liveTracker.teamFouls = {};
            this.liveTracker.teamFouls[qtr] = (this.liveTracker.teamFouls[qtr] || 0) + 1;
            desc = `Personal Foul (#${stats.pf}) by ${name}`;
            fxText = `🚨 FOUL #${stats.pf}! (${name})`;
            fxType = 'red';
            // Dead-ball foul resets ALL transition windows
            this.liveTracker.ourTransitionActive = false;
            this.liveTracker.oppTransitionActive = false;

            if (stats.pf >= 5) {
                window.WellnessModule.showToast(`⚠️ FOUL OUT! ${name} has 5 Personal Fouls!`, 'danger');
            } else if (stats.pf === 4) {
                window.WellnessModule.showToast(`⚠️ FOUL TROUBLE: ${name} has 4 Personal Fouls!`, 'warning');
            }
        } else if (action === 'd') {
            // Defensive rebound resets OUR transition window (we regained possession defensively)
            stats.dreb = (stats.dreb || 0) + 1;
            stats.reb = (stats.oreb || 0) + stats.dreb;
            desc = `Def Rebound by ${name}`;
            fxText = `🏀 DEF REBOUND (${name})`;
            fxType = 'blue';
            // We regained possession: reset opponent's transition, and also our own old transition
            this.liveTracker.oppTransitionActive = false;
            this.liveTracker.ourTransitionActive = false;
        } else if (action === 'o') {
            stats.oreb = (stats.oreb || 0) + 1;
            stats.reb = stats.oreb + (stats.dreb || 0);
            desc = `Off Rebound by ${name}`;
            fxText = `🏀 OFF REBOUND (${name})`;
            fxType = 'green';
        }

        // Trigger Courtside Visual FX
        if (fxText) {
            this.triggerCardActionFx(athleteId, fxText, fxType);
        }

        // Recalculate FIBA EFF
        let missedFg = stats.fga > stats.fgm ? (stats.fga - stats.fgm) : 0;
        let missedFt = stats.fta > stats.ftm ? (stats.fta - stats.ftm) : 0;
        stats.eff = (stats.pts + stats.reb + stats.ast + stats.stl + stats.blk) - (missedFg + missedFt + stats.to);

        this.liveTracker.playerStats[athleteId] = stats;
        
        // FIBA Real-Time Plus/Minus (+/-) & Team Score
        if (deltaPts > 0) {
            this.liveTracker.scoreTeam = (this.liveTracker.scoreTeam || 0) + deltaPts;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.quarterScores[qtr]) this.liveTracker.quarterScores[qtr] = { team: 0, opp: 0 };
            this.liveTracker.quarterScores[qtr].team += deltaPts;

            // === TRANSITION FAIL-SAFE: Accumulate PTS from TO if OUR window is active ===
            if (this.liveTracker.ourTransitionActive) {
                this.liveTracker.our_pts_from_to = (this.liveTracker.our_pts_from_to || 0) + deltaPts;
                this.liveTracker.ourTransitionActive = false; // reset after scoring
                window.WellnessModule.showToast(`🎯 PTS FROM TO! +${deltaPts} (Total: ${this.liveTracker.our_pts_from_to})`, 'success');
            }

            (this.liveTracker.onCourtIds || []).forEach(id => {
                if (this.liveTracker.playerStats[id]) {
                    this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) + deltaPts;
                }
            });
        }

        
        if (zoneName) {
            desc += ` from ${zoneName}`;
        }

        this.addLiveTrackerPbpEvent({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            athleteId,
            action,
            deltaPts,
            text: desc,
            quarter: this.liveTracker.quarter || 'Q1'
        });

        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    addLiveTrackerPbpEvent(evt) {
        if (!this.liveTracker.pbpEvents) this.liveTracker.pbpEvents = [];
        this.liveTracker.pbpEvents.unshift(evt);
    },

    showOpponentModeBanner(show) {
        const banner = document.getElementById('live-tracker-opp-mode-banner');
        if (banner) {
            banner.style.display = show ? 'block' : 'none';
        }
    },

    handleLiveTrackerOpponentAction(action) {
        if (!this.liveTracker) return;
        if (!this.liveTracker.oppStats) {
            this.liveTracker.oppStats = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
        }

        const oppName = this.liveTracker.oppName || 'Opponent';
        const stats = this.liveTracker.oppStats;
        let deltaPts = 0;
        let desc = '';
        let fxText = '';
        let fxType = 'red';

        if (action === '2') {
            deltaPts = 2;
            stats.pts += 2;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg2m = (stats.fg2m || 0) + 1;
            stats.fg2a = (stats.fg2a || 0) + 1;
            desc = `+2 PTS Made by ${oppName}`;
            fxText = `⚠️ OPPONENT +2 PTS MADE!`;
            fxType = 'red';
        } else if (action === 'w' || action === 'c') {
            stats.fga += 1;
            stats.fg2a = (stats.fg2a || 0) + 1;
            desc = `2PT Missed by ${oppName}`;
            fxText = `🛡️ OPPONENT 2PT MISSED`;
            fxType = 'green';
        } else if (action === '3') {
            deltaPts = 3;
            stats.pts += 3;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg3m = (stats.fg3m || 0) + 1;
            stats.fg3a = (stats.fg3a || 0) + 1;
            desc = `+3 PTS Made by ${oppName}`;
            fxText = `⚠️ OPPONENT +3 PTS MADE!`;
            fxType = 'red';
        } else if (action === 'e' || action === 'v') {
            stats.fga += 1;
            stats.fg3a = (stats.fg3a || 0) + 1;
            desc = `3PT Missed by ${oppName}`;
            fxText = `🛡️ OPPONENT 3PT MISSED`;
            fxType = 'green';
        } else if (action === '1') {
            deltaPts = 1;
            stats.pts += 1;
            stats.ftm = (stats.ftm || 0) + 1;
            stats.fta = (stats.fta || 0) + 1;
            desc = `+1 FT Made by ${oppName}`;
            fxText = `⚠️ OPPONENT +1 FT MADE`;
            fxType = 'red';
        } else if (action === 'g') {
            stats.fta = (stats.fta || 0) + 1;
            desc = `FT Missed by ${oppName}`;
            fxText = `🛡️ OPPONENT FT MISSED`;
            fxType = 'green';
        } else if (action === 'd' || action === 'r') {
            stats.dreb = (stats.dreb || 0) + 1;
            stats.reb = (stats.oreb || 0) + stats.dreb;
            desc = `Def Rebound by ${oppName}`;
            fxText = `🛡️ OPPONENT DEF REBOUND`;
            fxType = 'red';
            // Opponent regained possession: reset our transition, and their old transition
            this.liveTracker.ourTransitionActive = false;
            this.liveTracker.oppTransitionActive = false;
        } else if (action === 'o') {
            stats.oreb = (stats.oreb || 0) + 1;
            stats.reb = (stats.oreb || 0) + (stats.dreb || 0);
            desc = `Off Rebound by ${oppName}`;
            fxText = `⚠️ OPPONENT OFF REBOUND`;
            fxType = 'red';
        } else if (action === 'a') {
            stats.ast = (stats.ast || 0) + 1;
            desc = `Assist by ${oppName}`;
            fxText = `⚠️ OPPONENT ASSIST`;
            fxType = 'red';
        } else if (action === 's') {
            stats.stl = (stats.stl || 0) + 1;
            desc = `Steal by ${oppName}`;
            fxText = `⚠️ OPPONENT STEAL`;
            fxType = 'red';
            // === TRANSITION FAIL-SAFE: OPP Steal = OUR TO ===
            if (this.liveTracker.ourTransitionActive) {
                // Chaos: We were in transition, they stole it back
                this.liveTracker.ourTransitionActive = false;
                this.liveTracker.oppTransitionActive = true;
                window.WellnessModule.showToast(`CHAOS! OPP STEAL reverses transition! OPP window OPEN 🔴`, 'danger');
            } else if (!this.liveTracker.oppTransitionActive) {
                this.liveTracker.oppTransitionActive = true;
                window.WellnessModule.showToast(`⚠️ OPP STEAL! OPP TRANSITION WINDOW OPEN 🔴`, 'danger');
            }
        } else if (action === 'b') {
            stats.blk = (stats.blk || 0) + 1;
            desc = `Block by ${oppName}`;
            fxText = `⚠️ OPPONENT BLOCK`;
            fxType = 'red';
        } else if (action === 'k' || action === 't') {
            // If our transition window is ALREADY active, it means we either Stealed it (which auto-added TO) 
            // or they already pressed TO. We MUST ignore this to prevent double team turnover!
            if (this.liveTracker.ourTransitionActive) {
                window.WellnessModule.showToast(`Ignored duplicate OPP TO (Transition already active via Steal/TO)`, 'info');
                return; // Completely ignore this button press
            }
            
            stats.to = (stats.to || 0) + 1;
            desc = `Turnover by ${oppName}`;
            fxText = `🎯 OPPONENT TURNOVER`;
            fxType = 'green';
            // === TRANSITION FAIL-SAFE: OPP TO opens OUR transition window ===
            if (this.liveTracker.oppTransitionActive) {
                // Chaos Logic
                this.liveTracker.oppTransitionActive = false;
                this.liveTracker.ourTransitionActive = true;
                window.WellnessModule.showToast(`CHAOS! OPP TO reverses transition to ${this.liveTracker.teamName || 'OUR'}`, 'success');
            } else if (!this.liveTracker.ourTransitionActive) {
                this.liveTracker.ourTransitionActive = true;
                window.WellnessModule.showToast(`OPP TURNOVER! ${this.liveTracker.teamName || 'OUR'} TRANSITION WINDOW OPEN`, 'success');
            }
        } else if (action === 'x' || action === 'f') {
            stats.pf = (stats.pf || 0) + 1;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.oppFouls) this.liveTracker.oppFouls = {};
            this.liveTracker.oppFouls[qtr] = (this.liveTracker.oppFouls[qtr] || 0) + 1;
            desc = `Personal Foul (#${stats.pf}) by ${oppName}`;
            fxText = `🎯 OPPONENT FOUL #${stats.pf}`;
            fxType = 'green';
            // Dead-ball foul resets ALL transition windows
            this.liveTracker.oppTransitionActive = false;
            this.liveTracker.ourTransitionActive = false;
        }

        if (deltaPts > 0) {
            this.liveTracker.scoreOpp = (this.liveTracker.scoreOpp || 0) + deltaPts;
            const qtr2 = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.quarterScores[qtr2]) this.liveTracker.quarterScores[qtr2] = { team: 0, opp: 0 };
            this.liveTracker.quarterScores[qtr2].opp += deltaPts;

            // === TRANSITION FAIL-SAFE: OPP PTS from TO ===
            if (this.liveTracker.oppTransitionActive) {
                this.liveTracker.opp_pts_from_to = (this.liveTracker.opp_pts_from_to || 0) + deltaPts;
                this.liveTracker.oppTransitionActive = false;
                window.WellnessModule.showToast(`OPP PTS FROM TO! +${deltaPts} (Total: ${this.liveTracker.opp_pts_from_to})`, 'danger');
            }

            (this.liveTracker.onCourtIds || []).forEach(id => {
                if (this.liveTracker.playerStats[id]) {
                    this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) - deltaPts;
                }
            });
        }

        this.addLiveTrackerPbpEvent({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            isOpponent: true,
            action,
            deltaPts,
            text: desc
        });

        const scoreBadge = document.getElementById('live-tracker-score-badge');
        if (scoreBadge) {
            scoreBadge.textContent = fxText.split('!')[0].split('(')[0].trim();
            scoreBadge.style.display = 'inline-block';
            const badgeColor = fxType === 'green' ? '#10B981' : (fxType === 'red' ? '#EF4444' : '#F59E0B');
            scoreBadge.style.color = badgeColor;
            scoreBadge.style.borderColor = badgeColor;
            scoreBadge.style.background = fxType === 'green' ? 'rgba(16, 185, 129, 0.2)' : (fxType === 'red' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)');
            setTimeout(() => { scoreBadge.style.display = 'none'; }, 1200);
        }

        this.showOpponentModeBanner(false);
        this._oppKeyPending = false;
        if (this._oppTimeout) clearTimeout(this._oppTimeout);
        const onCourt = this.liveTracker.onCourtIds || [];
        this.liveTracker.selectedAthleteId = onCourt[0] || '';

        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    renderLiveTrackerPbpFeed() {
        const feed = document.getElementById('live-tracker-pbp-feed');
        if (!feed) return;
        feed.innerHTML = '';

        const events = this.liveTracker.pbpEvents || [];
        if (events.length === 0) {
            feed.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 12px;">No game actions logged yet. Press 1-5 or click a player card to start logging!</div>';
            return;
        }

        events.forEach((evt, idx) => {
            if (!evt.id) evt.id = `pbp_evt_${Date.now()}_${idx}_${Math.random().toString(36).substr(2,4)}`;
            const isEditable = !!evt.action;

            const borderCol = evt.isOpponent ? 'var(--accent-orange)' : (evt.deltaPts > 0 ? '#10B981' : 'var(--accent-blue)');
            const div = document.createElement('div');
            div.style = `padding: 4px 8px; margin-bottom: 3px; background: rgba(255,255,255,0.02); border-left: 3px solid ${borderCol}; border-radius: 4px; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 0.78rem;`;
            
            div.innerHTML = `
                <div style="display: flex; align-items: center; gap: 6px; min-width: 0; flex-grow: 1;">
                    <small style="color: var(--text-muted); font-family: monospace; flex-shrink: 0;">[${evt.time || ''}]</small>
                    <span style="white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">${evt.text || 'Action logged'}</span>
                    ${evt.deltaPts ? `<strong style="color: var(--accent-orange); font-family: monospace; margin-left: 4px;">+${evt.deltaPts}</strong>` : ''}
                </div>
                <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;" onclick="event.stopPropagation()">
                    ${isEditable ? `<button type="button" class="btn btn-secondary btn-xs" onclick="window.LiveTrackerModule.editLiveTrackerPbpEvent('${evt.id}')" style="padding: 1px 5px; font-size: 0.65rem;" title="Edit Event"><i class="fas fa-edit"></i></button>` : ''}
                    <button type="button" class="btn btn-secondary btn-xs" onclick="window.LiveTrackerModule.deleteLiveTrackerPbpEvent('${evt.id}')" style="padding: 1px 5px; font-size: 0.65rem; color: #EF4444; border-color: rgba(239,68,68,0.3);" title="Delete Event"><i class="fas fa-trash"></i></button>
                </div>
            `;
            feed.appendChild(div);
        });
    },

    editLiveTrackerPbpEvent(eventId) {
        if (!this.liveTracker || !this.liveTracker.pbpEvents) return;
        const evt = this.liveTracker.pbpEvents.find(e => e.id === eventId);
        if (!evt) return;

        const modal = document.getElementById('live-tracker-pbp-edit-modal');
        const idInput = document.getElementById('pbp-edit-event-id');
        const athSelect = document.getElementById('pbp-edit-athlete-select');
        const actSelect = document.getElementById('pbp-edit-action-select');

        if (!modal || !idInput || !athSelect || !actSelect) return;

        idInput.value = eventId;

        const oppName = this.liveTracker.oppName || 'OPPONENT';
        athSelect.innerHTML = `<option value="opponent_team_card">🛡️ ${oppName} (Opponent Team)</option>`;
        
        const athletes = this.getLiveTrackerAthletes();
        athletes.forEach(ath => {
            const opt = document.createElement('option');
            opt.value = ath.id;
            opt.textContent = `${ath.nickname || ath.fullName} ${ath.jerseyNumber ? '(#' + ath.jerseyNumber + ')' : ''}`;
            athSelect.appendChild(opt);
        });

        athSelect.value = evt.isOpponent ? 'opponent_team_card' : (evt.athleteId || '');
        actSelect.value = evt.action || '2';

        modal.style.display = 'flex';
    },

    saveEditedPbpEvent() {
        const idInput = document.getElementById('pbp-edit-event-id');
        const athSelect = document.getElementById('pbp-edit-athlete-select');
        const actSelect = document.getElementById('pbp-edit-action-select');
        const modal = document.getElementById('live-tracker-pbp-edit-modal');

        if (!idInput || !athSelect || !actSelect || !this.liveTracker) return;

        const eventId = idInput.value;
        const targetId = athSelect.value;
        const newAction = actSelect.value;

        const evt = this.liveTracker.pbpEvents.find(e => e.id === eventId);
        if (evt) {
            evt.action = newAction;
            if (targetId === 'opponent_team_card') {
                evt.isOpponent = true;
                delete evt.athleteId;
            } else {
                evt.isOpponent = false;
                evt.athleteId = targetId;
            }
        }

        if (modal) modal.style.display = 'none';
        this.recalculateLiveTrackerFromPbp();
        window.WellnessModule.showToast('✅ Updated event and recalculated stats & score!', 'success');
    },

    deleteLiveTrackerPbpEvent(eventId) {
        if (!this.liveTracker || !this.liveTracker.pbpEvents) return;
        const evtIndex = this.liveTracker.pbpEvents.findIndex(e => e.id === eventId);
        if (evtIndex > -1) {
            const removed = this.liveTracker.pbpEvents.splice(evtIndex, 1)[0];
            this.recalculateLiveTrackerFromPbp();
            window.WellnessModule.showToast(`🗑️ Deleted: ${removed ? removed.text : 'Event'}`, 'warning');
        }
    },

    recalculateLiveTrackerFromPbp() {
        if (!this.liveTracker) return;

        this.liveTracker.scoreTeam = 0;
        this.liveTracker.scoreOpp = 0;
        this.liveTracker.teamFouls = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT: 0 };
        this.liveTracker.oppFouls = { Q1: 0, Q2: 0, Q3: 0, Q4: 0, OT: 0 };
        this.liveTracker.oppStats = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
        this.liveTracker.quarterScores = { Q1: { team: 0, opp: 0 }, Q2: { team: 0, opp: 0 }, Q3: { team: 0, opp: 0 }, Q4: { team: 0, opp: 0 }, OT: { team: 0, opp: 0 } };
        this.liveTracker.ourTransitionActive = false;
        this.liveTracker.oppTransitionActive = false;
        this.liveTracker.our_pts_from_to = 0;
        this.liveTracker.opp_pts_from_to = 0;
        
        this.liveTracker.playerStats = {};
        const athletes = this.getLiveTrackerAthletes();
        athletes.forEach(a => {
            this.liveTracker.playerStats[a.id] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
        });

        const oppName = this.liveTracker.oppName || 'Opponent';
        const pbpList = (this.liveTracker.pbpEvents || []).slice().reverse();

        pbpList.forEach(evt => {
            if (!evt.action) return;
            const action = evt.action;
            let deltaPts = 0;
            let desc = '';

            if (evt.isOpponent) {
                const stats = this.liveTracker.oppStats;
                if (action === '2') {
                    deltaPts = 2; stats.pts += 2; stats.fgm += 1; stats.fga += 1; stats.fg2m = (stats.fg2m||0)+1; stats.fg2a = (stats.fg2a||0)+1;
                    desc = `+2 PTS Made by ${oppName}`;
                } else if (action === 'w' || action === 'c') {
                    stats.fga += 1; stats.fg2a = (stats.fg2a||0)+1; desc = `2PT Missed by ${oppName}`;
                } else if (action === '3') {
                    deltaPts = 3; stats.pts += 3; stats.fgm += 1; stats.fga += 1; stats.fg3m = (stats.fg3m||0)+1; stats.fg3a = (stats.fg3a||0)+1;
                    desc = `+3 PTS Made by ${oppName}`;
                } else if (action === 'e' || action === 'v') {
                    stats.fga += 1; stats.fg3a = (stats.fg3a||0)+1; desc = `3PT Missed by ${oppName}`;
                } else if (action === '1' || action === 'f') {
                    deltaPts = 1; stats.pts += 1; stats.ftm = (stats.ftm||0)+1; stats.fta = (stats.fta||0)+1; desc = `+1 FT Made by ${oppName}`;
                } else if (action === 'g') {
                    stats.fta = (stats.fta||0)+1; desc = `FT Missed by ${oppName}`;
                } else if (action === 'd' || action === 'r') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Def Rebound by ${oppName}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'o') {
                    stats.oreb = (stats.oreb||0)+1; stats.reb = (stats.oreb||0) + (stats.dreb||0); desc = `Off Rebound by ${oppName}`;
                } else if (action === 'a') {
                    stats.ast = (stats.ast || 0) + 1; desc = `Assist by ${oppName}`;
                } else if (action === 's') {
                    stats.stl = (stats.stl || 0) + 1; desc = `Steal by ${oppName}`;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = false;
                        this.liveTracker.oppTransitionActive = true;
                    } else if (!this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = true;
                    }
                } else if (action === 'b') {
                    stats.blk = (stats.blk || 0) + 1; desc = `Block by ${oppName}`;
                } else if (action === 'k' || action === 't') {
                    stats.to = (stats.to || 0) + 1; desc = `Turnover by ${oppName}`;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = false;
                        this.liveTracker.ourTransitionActive = true;
                    } else if (!this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = true;
                    }
                } else if (action === 'x') {
                    stats.pf = (stats.pf || 0) + 1; desc = `Personal Foul by ${oppName}`;
                    this.liveTracker.ourTransitionActive = false; this.liveTracker.oppTransitionActive = false;
                }

                if (deltaPts > 0) {
                    this.liveTracker.scoreOpp = (this.liveTracker.scoreOpp || 0) + deltaPts;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.opp_pts_from_to = (this.liveTracker.opp_pts_from_to || 0) + deltaPts;
                        this.liveTracker.oppTransitionActive = false;
                    }
                    (this.liveTracker.onCourtIds || []).forEach(id => {
                        if (this.liveTracker.playerStats[id]) {
                            this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) - deltaPts;
                        }
                    });
                }
            } else if (evt.athleteId) {
                if (!this.liveTracker.playerStats[evt.athleteId]) {
                    this.liveTracker.playerStats[evt.athleteId] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
                }
                const stats = this.liveTracker.playerStats[evt.athleteId];
                const ath = athletes.find(a => a.id === evt.athleteId);
                const name = ath ? (ath.nickname || ath.fullName) : evt.athleteId;

                if (action === '2') {
                    deltaPts = 2; stats.pts += 2; stats.fgm += 1; stats.fga += 1; stats.fg2m += 1; stats.fg2a += 1;
                    desc = `+2 PTS (2PT Made) by ${name}`;
                } else if (action === 'w' || action === 'c') {
                    stats.fga += 1; stats.fg2a += 1; desc = `2PT Missed by ${name}`;
                } else if (action === '3') {
                    deltaPts = 3; stats.pts += 3; stats.fgm += 1; stats.fga += 1; stats.fg3m += 1; stats.fg3a += 1;
                    desc = `+3 PTS (3PT Made) by ${name}`;
                } else if (action === 'e' || action === 'v') {
                    stats.fga += 1; stats.fg3a += 1; desc = `3PT Missed by ${name}`;
                } else if (action === '1' || action === 'f') {
                    deltaPts = 1; stats.pts += 1; stats.ftm += 1; stats.fta += 1; desc = `+1 FT Made by ${name}`;
                } else if (action === 'g') {
                    stats.fta += 1; desc = `FT Missed by ${name}`;
                } else if (action === 'd') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Defensive Rebound by ${name}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'o') {
                    stats.oreb = (stats.oreb||0)+1; stats.reb = (stats.oreb||0) + (stats.dreb||0); desc = `Offensive Rebound by ${name}`;
                } else if (action === 'r') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Rebound by ${name}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'a') {
                    stats.ast = (stats.ast || 0) + 1; desc = `Assist by ${name}`;
                } else if (action === 's') {
                    stats.stl = (stats.stl || 0) + 1; desc = `Steal by ${name}`;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = false;
                        this.liveTracker.ourTransitionActive = true;
                    } else if (!this.liveTracker.ourTransitionActive) {
                        if (!this.liveTracker.oppStats) this.liveTracker.oppStats = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
                        this.liveTracker.oppStats.to = (this.liveTracker.oppStats.to || 0) + 1;
                        this.liveTracker.ourTransitionActive = true;
                    }
                } else if (action === 'b') {
                    stats.blk = (stats.blk || 0) + 1; desc = `Block by ${name}`;
                } else if (action === 'k' || action === 't') {
                    stats.to = (stats.to || 0) + 1; desc = `Turnover by ${name}`;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = false;
                        this.liveTracker.oppTransitionActive = true;
                    } else if (!this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = true;
                    }
                } else if (action === 'x') {
                    stats.pf = (stats.pf || 0) + 1; desc = `Personal Foul by ${name}`;
                    this.liveTracker.ourTransitionActive = false; this.liveTracker.oppTransitionActive = false;
                }

                let missedFg = stats.fga > stats.fgm ? (stats.fga - stats.fgm) : 0;
                let missedFt = stats.fta > stats.ftm ? (stats.fta - stats.ftm) : 0;
                stats.eff = (stats.pts + stats.reb + stats.ast + stats.stl + stats.blk) - (missedFg + missedFt + stats.to);

                if (deltaPts > 0) {
                    this.liveTracker.scoreTeam = (this.liveTracker.scoreTeam || 0) + deltaPts;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.our_pts_from_to = (this.liveTracker.our_pts_from_to || 0) + deltaPts;
                        this.liveTracker.ourTransitionActive = false;
                    }
                    (this.liveTracker.onCourtIds || []).forEach(id => {
                        if (this.liveTracker.playerStats[id]) {
                            this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) + deltaPts;
                        }
                    });
                }
            }

            evt.deltaPts = deltaPts;
            if (desc) evt.text = desc;
        });

        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    undoLiveTrackerAction() {
        if (!this.liveTracker || !this.liveTracker.pbpEvents || this.liveTracker.pbpEvents.length === 0) {
            window.WellnessModule.showToast('Nothing to undo.', 'info');
            return;
        }

        const lastEvt = this.liveTracker.pbpEvents.shift();
        this.recalculateLiveTrackerFromPbp();
        window.WellnessModule.showToast(`Undid: ${lastEvt ? lastEvt.text : 'Action'}`, 'warning');
    },

    confirmResetLiveTracker() {
        if (confirm('Clear current live stat tracking session and reset all player stats to 0?')) {
            localStorage.removeItem('atp_live_tracker_session');
            this.resetLiveTrackerState();
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast('Session reset cleanly! Scores and +/- are 0.', 'success');
        }
    },

    editAthleteJerseyNumber(athleteId) {
        const athletes = window.Store.getAthletesOnly();
        const ath = athletes.find(a => a.id === athleteId);
        const name = ath ? (ath.nickname || ath.fullName) : 'Athlete';
        const currentJersey = ath ? (ath.jerseyNumber || '') : '';
        
        const newJersey = prompt(`Enter Jersey Number for ${name} (e.g. 7 or 23):`, currentJersey);
        if (newJersey !== null) {
            const trimmed = newJersey.trim();
            if (ath) {
                ath.jerseyNumber = trimmed;
                window.Store.saveAthlete(ath);
            }
            if (this.liveTracker) {
                this.syncLiveTrackerUI();
            }
            window.WellnessModule.showToast(`Updated Jersey #${trimmed || '-'} for ${name}`, 'success');
        }
    },

    advanceLiveTrackerQuarter() {
        if (!this.liveTracker) return;
        const currentQ = this.liveTracker.quarter || 'Q1';
        const qtrMap = { 'Q1': 'Q2', 'Q2': 'Q3', 'Q3': 'Q4', 'Q4': 'OT', 'OT': 'OT' };
        const nextQ = qtrMap[currentQ] || 'Q2';

        const teamPts = this.liveTracker.scoreTeam || 0;
        const oppPts = this.liveTracker.scoreOpp || 0;

        if (confirm(`End ${currentQ}? Current Score: ${this.liveTracker.teamName || 'MPS'} ${teamPts} - ${oppPts} ${this.liveTracker.oppName || 'OPP'}\n\nAdvance to ${nextQ}?`)) {
            this.liveTracker.quarter = nextQ;
            const select = document.getElementById('live-tracker-quarter-select');
            if (select) select.value = nextQ;

            this.addLiveTrackerPbpEvent({
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                text: `⏱️ END OF ${currentQ} — Score: ${this.liveTracker.teamName || 'MPS'} ${teamPts} - ${oppPts} ${this.liveTracker.oppName || 'OPP'}`
            });

            window.WellnessModule.showToast(`⏱️ END OF ${currentQ}! Advanced to ${nextQ} (Score: ${teamPts} - ${oppPts})`, 'success');
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
        }
    },

    handleLiveTrackerKeydown(e) {
        const liveView = document.getElementById('live-tracker-view');
        if (!liveView || !liveView.classList.contains('active')) return;
        
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            if (e.key === 'Escape') {
                e.target.blur();
            } else {
                return;
            }
        }
        if (e.target.tagName === 'SELECT') {
            e.target.blur();
        }

        const key = e.key.toLowerCase();

        if (e.code === 'Space' || key === ' ' || e.keyCode === 32) {
            e.preventDefault();
            this.advanceLiveTrackerQuarter();
            return;
        }

        if (key === 'o' && !this._oppKeyPending && this.liveTracker.selectedAthleteId !== 'opponent_team_card') {
            e.preventDefault();
            this._oppKeyPending = true;
            this.liveTracker.selectedAthleteId = 'opponent_team_card';
            this.syncLiveTrackerUI();
            this.showOpponentModeBanner(true);
            window.WellnessModule.showToast('🔥 OPPONENT MODE ACTIVE: Press action key now (1/2/3, Shift+1/2/3 for miss, D, Shift+D, etc.)', 'warning');
            if (this._oppTimeout) clearTimeout(this._oppTimeout);
            this._oppTimeout = setTimeout(() => {
                this._oppKeyPending = false;
                this.showOpponentModeBanner(false);
            }, 5000);
            return;
        } else if (key === 'o' && (this._oppKeyPending || this.liveTracker.selectedAthleteId === 'opponent_team_card')) {
            e.preventDefault();
            this._oppKeyPending = false;
            if (this._oppTimeout) clearTimeout(this._oppTimeout);
            this.showOpponentModeBanner(false);
            const onCourt = this.liveTracker.onCourtIds || [];
            this.liveTracker.selectedAthleteId = onCourt[0] || '';
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast('Switched back to Court Player [Q]', 'info');
            return;
        }

        if (this._subModeActive && ['1','2','3','4','5','6','7','8','9','0'].includes(key) && !e.shiftKey) {
            e.preventDefault();
            this._subModeActive = false;
            const benchIndex = key === '0' ? 9 : (parseInt(key) - 1);
            const athletes = this.getLiveTrackerAthletes();
            const benchAthletes = athletes.filter(a => !(this.liveTracker.onCourtIds || []).includes(a.id));
            
            if (benchAthletes[benchIndex]) {
                this.substituteLiveTrackerPlayer(benchAthletes[benchIndex].id);
            } else {
                window.WellnessModule.showToast(`Bench Player #${key} not found. Sub cancelled.`, 'danger');
                this.syncLiveTrackerUI();
            }
            return;
        }

        if (this._subModeActive && key === 'escape') {
            this._subModeActive = false;
            window.WellnessModule.showToast('Sub Mode cancelled.', 'info');
            this.syncLiveTrackerUI();
            return;
        }

        const playerKeyMap = { 'q': 0, 'w': 1, 'e': 2, 'r': 3, 't': 4 };
        if (playerKeyMap.hasOwnProperty(key)) {
            const idx = playerKeyMap[key];
            const onCourt = this.liveTracker.onCourtIds || [];
            if (onCourt[idx]) {
                e.preventDefault();
                this.liveTracker.selectedAthleteId = onCourt[idx];
                this._oppKeyPending = false;
                this.showOpponentModeBanner(false);
                
                if (e.shiftKey) {
                    this._subModeActive = !this._subModeActive;
                    this.syncLiveTrackerUI();
                    const athletes = this.getLiveTrackerAthletes();
                    const selAth = athletes.find(a => a.id === onCourt[idx]);
                    const pName = selAth ? (selAth.nickname || selAth.fullName) : `Player #${idx + 1}`;
                    if (this._subModeActive) {
                        window.WellnessModule.showToast(`🔄 SUB MODE: Subbing out ${pName}. Press 1-9 to select Bench player!`, 'warning');
                    } else {
                        window.WellnessModule.showToast('Sub Mode cancelled.', 'info');
                    }
                } else {
                    this._subModeActive = false;
                    this.syncLiveTrackerUI();
                    const athletes = this.getLiveTrackerAthletes();
                    const selAth = athletes.find(a => a.id === onCourt[idx]);
                    const pName = selAth ? (selAth.nickname || selAth.fullName) : `Player #${idx + 1}`;
                    window.WellnessModule.showToast(`Selected Court Player [${key.toUpperCase()}]: ${pName}`, 'info');
                }
                return;
            }
        }

        if (key === 'tab' || key === 'n') {
            e.preventDefault();
            this._subModeActive = !this._subModeActive;
            this.syncLiveTrackerUI();
            if (this._subModeActive) {
                window.WellnessModule.showToast(`🔄 SUB MODE: Press 1-9 or 0 to select Bench player (Press Tab again to cancel)`, 'warning');
            } else {
                window.WellnessModule.showToast('Sub Mode cancelled.', 'info');
            }
            return;
        }

        const targetId = this.liveTracker.selectedAthleteId;
        if (!targetId) return;

        if (key === 'u' || (e.metaKey && key === 'z') || (e.ctrlKey && key === 'z')) {
            e.preventDefault();
            this.undoLiveTrackerAction();
            return;
        }

        let actionToRun = key;
        const shiftMissMap = {
            '!': 'g', '1': 'g', 'Digit1': 'g',
            '@': 'c', '2': 'c', 'Digit2': 'c',
            '#': 'v', '3': 'v', 'Digit3': 'v',
            'D': 'o', 'd': 'o', 'KeyD': 'o'
        };
        if (e.shiftKey || ['!', '@', '#'].includes(e.key)) {
            const mapped = shiftMissMap[e.key] || shiftMissMap[e.code];
            if (mapped) actionToRun = mapped;
        }

        if (targetId === 'opponent_team_card' || this._oppKeyPending) {
            if (['1', '2', '3', 'w', 'c', 'e', 'v', 'f', 'g', 'd', 'r', 'o', 'a', 's', 'b', 'k', 't', 'x'].includes(actionToRun)) {
                e.preventDefault();
                this._oppKeyPending = false;
                this.showOpponentModeBanner(false);
                const onCourt = this.liveTracker.onCourtIds || [];
                this.liveTracker.selectedAthleteId = onCourt[0] || '';
                this.handleLiveTrackerOpponentAction(actionToRun);
                return;
            }
        }

        if (['1', '2', '3', 'w', 'e', 'f', 'g', 'a', 's', 'b', 'x', 'c', 'v', 'k', 'd', 'o', 't'].includes(actionToRun)) {
            e.preventDefault();
            this.handleLiveTrackerCardAction(targetId, actionToRun);
        }
    },

    toggleLiveTrackerCheatSheet() {
        const bar = document.getElementById('live-tracker-cheatsheet-bar');
        if (bar) {
            bar.style.display = bar.style.display === 'none' ? 'block' : 'none';
        }
    },

    showLiveTrackerRecap() {
        const modal = document.getElementById('live-tracker-recap-modal');
        const content = document.getElementById('live-tracker-recap-content');
        if (!modal || !content || !this.liveTracker) return;

        const athletes = window.Store.getAthletesOnly();
        const playerStats = this.liveTracker.playerStats || {};
        const oppStats = this.liveTracker.oppStats || { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0 };
        const teamName = this.liveTracker.teamName || 'MPS';
        const oppName = this.liveTracker.oppName || 'OPPONENT';

        let teamPts = 0, teamReb = 0, teamAst = 0, teamStl = 0, teamBlk = 0, teamTo = 0, teamPf = 0, teamFgm = 0, teamFga = 0, teamFtm = 0, teamFta = 0;

        let rowsHtml = '';
        Object.keys(playerStats).forEach(id => {
            const s = playerStats[id];
            if (s.pts > 0 || s.reb > 0 || s.ast > 0 || s.to > 0 || s.pf > 0) {
                const ath = athletes.find(a => a.id === id);
                const name = ath ? (window.App && typeof window.App.getAthleteDisplayName === 'function' ? window.App.getAthleteDisplayName(ath) : (ath.nickname || ath.fullName)) : id;
                teamPts += s.pts;
                teamReb += s.reb;
                teamAst += s.ast;
                teamStl += s.stl;
                teamBlk += s.blk;
                teamTo += s.to;
                teamPf += s.pf;
                teamFgm += s.fgm;
                teamFga += s.fga;
                teamFtm += (s.ftm || 0);
                teamFta += (s.fta || 0);

                rowsHtml += `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                        <td style="padding: 6px 4px; font-weight: bold; color: var(--text-primary);">${name}</td>
                        <td style="text-align: center; color: var(--accent-orange); font-weight: bold;">${s.pts}</td>
                        <td style="text-align: center;">${s.reb} <small style="color: var(--accent-blue); font-size: 0.7rem;">(${s.oreb || 0}/${s.dreb || 0})</small></td>
                        <td style="text-align: center;">${s.ast}</td>
                        <td style="text-align: center;">${s.stl}</td>
                        <td style="text-align: center;">${s.blk}</td>
                        <td style="text-align: center;">${s.to}</td>
                        <td style="text-align: center; color: ${s.pf >= 5 ? '#EF4444' : 'inherit'};">${s.pf}</td>
                        <td style="text-align: center; color: ${s.pm > 0 ? '#10B981' : (s.pm < 0 ? '#EF4444' : 'inherit')};">${s.pm > 0 ? '+' + s.pm : s.pm}</td>
                        <td style="text-align: center; color: var(--accent-blue); font-weight: bold;">${s.eff}</td>
                    </tr>
                `;
            }
        });

        const finalTeamPts = Math.max(teamPts, this.liveTracker.scoreTeam || 0);
        const finalOppPts = Math.max(oppStats.pts || 0, this.liveTracker.scoreOpp || 0);
        const teamFgPct = teamFga > 0 ? ((teamFgm / teamFga) * 100).toFixed(1) + '%' : '0.0%';
        const oppFgPct = oppStats.fga > 0 ? ((oppStats.fgm / oppStats.fga) * 100).toFixed(1) + '%' : '0.0%';
        const teamFtPct = teamFta > 0 ? ((teamFtm / teamFta) * 100).toFixed(1) + '%' : '0.0%';
        const oppFtPct = (oppStats.fta || 0) > 0 ? (((oppStats.ftm || 0) / oppStats.fta) * 100).toFixed(1) + '%' : '0.0%';
        const teamAstTo = teamTo > 0 ? (teamAst / teamTo).toFixed(1) : teamAst;
        const oppAstTo = oppStats.to > 0 ? ((oppStats.ast || 0) / oppStats.to).toFixed(1) : (oppStats.ast || 0);

        const compMetrics = [
            { label: 'POINTS', teamVal: finalTeamPts, oppVal: finalOppPts, isHigherBetter: true },
            { label: 'FIELD GOAL %', teamVal: teamFgPct, oppVal: oppFgPct, isHigherBetter: true },
            { label: 'FREE THROW %', teamVal: teamFtPct, oppVal: oppFtPct, isHigherBetter: true },
            { label: 'REBOUNDS', teamVal: teamReb, oppVal: oppStats.reb || 0, isHigherBetter: true },
            { label: 'ASSISTS', teamVal: teamAst, oppVal: oppStats.ast || 0, isHigherBetter: true },
            { label: 'STEALS', teamVal: teamStl, oppVal: oppStats.stl || 0, isHigherBetter: true },
            { label: 'BLOCKS', teamVal: teamBlk, oppVal: oppStats.blk || 0, isHigherBetter: true },
            { label: 'TURNOVERS', teamVal: teamTo, oppVal: oppStats.to || 0, isHigherBetter: false },
            { label: 'FOULS', teamVal: teamPf, oppVal: oppStats.pf || 0, isHigherBetter: false },
            { label: 'AST / TO RATIO', teamVal: teamAstTo, oppVal: oppAstTo, isHigherBetter: true }
        ];

        let compRowsHtml = '';
        compMetrics.forEach(m => {
            compRowsHtml += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;">
                    <td style="text-align: right; padding: 8px 12px; font-weight: bold; color: var(--accent-blue); width: 35%;">${m.teamVal}</td>
                    <td style="text-align: center; padding: 8px 6px; font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: bold; letter-spacing: 0.5px; width: 30%;">${m.label}</td>
                    <td style="text-align: left; padding: 8px 12px; font-weight: bold; color: var(--accent-orange); width: 35%;">${m.oppVal}</td>
                </tr>
            `;
        });

        content.innerHTML = `
            <div style="background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 8px; padding: 14px; margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color); padding-bottom: 10px; margin-bottom: 10px;">
                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--accent-blue);">${teamName}</div>
                    <div style="font-size: 0.75rem; color: #F59E0B; font-weight: bold; letter-spacing: 1px; text-transform: uppercase;">TEAM COMPARISON</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--accent-orange);">${oppName}</div>
                </div>
                <table style="width: 100%; border-collapse: collapse;">
                    <tbody>
                        ${compRowsHtml}
                    </tbody>
                </table>
            </div>

            <div style="font-size: 0.8rem; font-weight: bold; color: var(--text-primary); margin-bottom: 8px; text-transform: uppercase;">
                <i class="fas fa-users" style="color: var(--accent-blue); margin-right: 6px;"></i> ${teamName} Player Roster Stats
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                <thead>
                    <tr style="border-bottom: 2px solid var(--border-color); color: var(--text-muted); text-align: center;">
                        <th style="text-align: left; padding: 6px 4px;">Player</th>
                        <th>PTS</th>
                        <th>REB</th>
                        <th>AST</th>
                        <th>STL</th>
                        <th>BLK</th>
                        <th>TO</th>
                        <th>PF</th>
                        <th>+/-</th>
                        <th>EFF</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml || '<tr><td colspan="10" style="text-align: center; color: var(--text-muted); padding: 12px;">No individual player stats recorded yet.</td></tr>'}
                </tbody>
            </table>
        `;
        modal.style.display = 'flex';
    },


    openLiveTrackerWizard() {
        const modal = document.getElementById('live-tracker-wizard-modal');
        if (!modal) return;
        
        // Populate Tournament Dropdown from existing match logs
        const select = document.getElementById('wizard-tournament-select');
        const logs = window.Store.getMatches ? window.Store.getMatches() : [];
        const uniqueTitles = [...new Set(logs.map(l => l.name || l.title).filter(Boolean))];
        
        select.innerHTML = '<option value="new">+ Create New Tournament</option>';
        uniqueTitles.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t;
            select.appendChild(opt);
        });
        
        // Reset Inputs
        document.getElementById('wizard-tournament-new').value = '';
        document.getElementById('wizard-tournament-new').style.display = 'block';
        document.getElementById('wizard-opponent-name').value = '';
        
        // Default Mode
        document.getElementById('wizard-game-mode').value = '5x5';
        this.wizardSelectedAthletes = [];
        this.renderWizardRoster();
        
        modal.style.display = 'flex';
    },

    wizardTournamentSelectChange() {
        const val = document.getElementById('wizard-tournament-select').value;
        const newTournInput = document.getElementById('wizard-tournament-new');
        if (val === 'new') {
            newTournInput.style.display = 'block';
        } else {
            newTournInput.style.display = 'none';
        }
    },

    renderWizardRoster() {
        const mode = document.getElementById('wizard-game-mode').value;
        const limit = mode === '5x5' ? 12 : 4;
        const checklist = document.getElementById('wizard-roster-checklist');
        const countLabel = document.getElementById('wizard-roster-count');
        
        const allAthletes = window.Store.getAthletesOnly();
        checklist.innerHTML = '';
        
        allAthletes.forEach(ath => {
            const isSelected = (this.wizardSelectedAthletes || []).includes(ath.id);
            const item = document.createElement('div');
            item.style.padding = '8px';
            item.style.border = '1px solid var(--border-color)';
            item.style.background = isSelected ? 'var(--text-primary)' : 'rgba(255,255,255,0.02)';
            item.style.color = isSelected ? 'var(--bg-primary)' : 'var(--text-primary)';
            item.style.cursor = 'pointer';
            item.style.fontWeight = isSelected ? 'bold' : 'normal';
            item.style.display = 'flex';
            item.style.alignItems = 'center';
            item.style.gap = '8px';
            
            const checkboxHtml = isSelected 
                ? '<i class="fas fa-check-square"></i>' 
                : '<i class="far fa-square" style="color: var(--text-muted);"></i>';
                
            item.innerHTML = `${checkboxHtml} <span style="font-size: 0.8rem;">${ath.nickname || ath.fullName}</span> <small style="margin-left: auto; color: ${isSelected ? 'var(--bg-secondary)' : 'var(--accent-blue)'};">#${ath.jerseyNumber || '-'}</small>`;
            
            item.onclick = () => window.App.toggleWizardRosterItem(ath.id);
            checklist.appendChild(item);
        });
        
        countLabel.textContent = `${(this.wizardSelectedAthletes || []).length} / ${limit} Selected`;
        if ((this.wizardSelectedAthletes || []).length > limit) {
            countLabel.style.color = '#EF4444'; // Red if over limit
        } else {
            countLabel.style.color = 'var(--accent-orange)';
        }
    },

    toggleWizardRosterItem(id) {
        if (!this.wizardSelectedAthletes) this.wizardSelectedAthletes = [];
        const mode = document.getElementById('wizard-game-mode').value;
        const limit = mode === '5x5' ? 12 : 4;
        
        const idx = this.wizardSelectedAthletes.indexOf(id);
        if (idx > -1) {
            this.wizardSelectedAthletes.splice(idx, 1);
        } else {
            if (this.wizardSelectedAthletes.length >= limit) {
                window.WellnessModule.showToast(`Roster cap reached for ${mode} mode (Max ${limit})`, 'danger');
                return;
            }
            this.wizardSelectedAthletes.push(id);
        }
        this.renderWizardRoster();
    },

    applyLiveTrackerWizard() {
        const mode = document.getElementById('wizard-game-mode').value;
        const limit = mode === '5x5' ? 12 : 4;
        
        if (!this.wizardSelectedAthletes || this.wizardSelectedAthletes.length === 0) {
            window.WellnessModule.showToast('Please select at least 1 player for the game-day roster.', 'danger');
            return;
        }
        if (this.wizardSelectedAthletes.length > limit) {
            window.WellnessModule.showToast(`Cannot exceed ${limit} players for ${mode}.`, 'danger');
            return;
        }
        
        const tournSelect = document.getElementById('wizard-tournament-select').value;
        const tournName = tournSelect === 'new' ? document.getElementById('wizard-tournament-new').value.trim() : tournSelect;
        const oppName = document.getElementById('wizard-opponent-name').value.trim();
        
        if (!tournName) {
            window.WellnessModule.showToast('Tournament Parent Name is required.', 'danger');
            return;
        }
        if (!oppName) {
            window.WellnessModule.showToast('Opponent Name is required.', 'danger');
            return;
        }
        
        // Reset Tracker and inject config
        this.resetLiveTrackerState();
        
        this.liveTracker.matchId = 'lt_' + Date.now();
        this.liveTracker.title = tournName;
        this.liveTracker.oppName = oppName;
        this.liveTracker.teamName = 'MPS';
        this.liveTracker.gameMode = mode;
        this.liveTracker.gameDayRosterIds = [...this.wizardSelectedAthletes]; // Custom exclusive roster
        
        // Auto-assign first 5 (or 3) to on-court
        const onCourtLimit = mode === '5x5' ? 5 : 3;
        this.liveTracker.onCourtIds = this.wizardSelectedAthletes.slice(0, onCourtLimit);
        this.liveTracker.selectedAthleteId = this.liveTracker.onCourtIds[0];
        
        // Explicitly build playerStats ONLY for the selected roster so the report is clean
        this.liveTracker.playerStats = {};
        this.wizardSelectedAthletes.forEach(id => {
            this.liveTracker.playerStats[id] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
        });
        
        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
        
        // Update Header Labels
        const tLabel = document.getElementById('live-tracker-active-tournament-label');
        const oLabel = document.getElementById('live-tracker-active-opponent-label');
        const mLabel = document.getElementById('live-tracker-active-mode-label');
        
        if (tLabel) tLabel.textContent = tournName;
        if (oLabel) oLabel.textContent = oppName;
        if (mLabel) mLabel.textContent = mode;
        
        // Close modal
        document.getElementById('live-tracker-wizard-modal').style.display = 'none';
        window.WellnessModule.showToast(`Console initialized: ${tournName} vs ${oppName} [${mode}]`, 'success');
    },

    pushLiveTrackerToMatchLog() {
        if (!this.liveTracker) return;
        if (window.App && typeof window.App.checkAdminPermission === 'function' && !window.App.checkAdminPermission()) return;

        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const matchId = this.liveTracker.matchId;

        const playerStats = [];
        Object.keys(this.liveTracker.playerStats || {}).forEach(id => {
            const s = this.liveTracker.playerStats[id];
            if (s) {
                if (true) { // Feature 4: Force complete roster accumulation regardless of stats
                    playerStats.push({
                        athleteId: id,
                        min: s.min || 0,
                        pts: s.pts || 0,
                        fgm: s.fgm || 0,
                        fga: s.fga || 0,
                        fg2m: s.fg2m || 0,
                        fg2a: s.fg2a || 0,
                        fg3m: s.fg3m || 0,
                        fg3a: s.fg3a || 0,
                        ftm: s.ftm || 0,
                        fta: s.fta || 0,
                        reb: s.reb || 0,
                        oreb: s.oreb || 0,
                        dreb: s.dreb || 0,
                        ast: s.ast || 0,
                        stl: s.stl || 0,
                        blk: s.blk || 0,
                        to: s.to || 0,
                        pf: s.pf || 0,
                        pm: s.pm || 0,
                        plusMinus: s.pm || 0,
                        eff: s.eff || 0
                    });
                }
            }
        });

        const oppStatsCopy = JSON.parse(JSON.stringify(this.liveTracker.oppStats || {}));

        const newGameRound = {
            stage: this.liveTracker.quarter || 'Group Stage',
            opponent: this.liveTracker.oppName || 'Opponent',
            scoreAtp: this.liveTracker.scoreTeam || 0,
            scoreOpp: this.liveTracker.scoreOpp || 0,
            stats: `Live Tracker Session: ${this.liveTracker.teamName} vs ${this.liveTracker.oppName}`,
            notes: `Recorded via Live Stat Tracker Console`,
            our_pts_from_to: this.liveTracker.our_pts_from_to || 0,
            opp_pts_from_to: this.liveTracker.opp_pts_from_to || 0,
            oppStats: oppStatsCopy,
            playerStats,
            pbpEvents: this.liveTracker.pbpEvents || []
        };

        if (matchId !== 'new' && logs.findIndex(l => l.id === matchId) > -1) {
            const index = logs.findIndex(l => l.id === matchId);
            if (!logs[index].games) logs[index].games = [];
            if (logs[index].games.length > 0) {
                logs[index].games[0] = newGameRound;
            } else {
                logs[index].games.push(newGameRound);
            }
            logs[index].atpScore = newGameRound.scoreAtp;
            logs[index].oppScore = newGameRound.scoreOpp;
            logs[index].our_pts_from_to = newGameRound.our_pts_from_to || 0;
            logs[index].opp_pts_from_to = newGameRound.opp_pts_from_to || 0;
            logs[index].oppStats = oppStatsCopy;
            localStorage.setItem('atp_match_logs', JSON.stringify(logs));
            window.WellnessModule.showToast(`Pushed game round to ${logs[index].title}!`, 'success');
        } else {
            const tourneyTag = (this.liveTracker.oppName && this.liveTracker.oppName.toLowerCase().includes('tybi')) ? '' : ' (TYBI 2026)';
            const actualMatchId = (matchId && matchId !== 'new') ? matchId : 'match_log_' + Date.now();
            const newMatch = {
                id: actualMatchId,
                title: `${this.liveTracker.teamName} vs ${this.liveTracker.oppName}${tourneyTag}`,
                opponent: this.liveTracker.oppName || 'Opponent',
                date: window.Store.getLocalDateString(),
                endDate: window.Store.getLocalDateString(),
                atpScore: newGameRound.scoreAtp,
                oppScore: newGameRound.scoreOpp,
                our_pts_from_to: newGameRound.our_pts_from_to,
                opp_pts_from_to: newGameRound.opp_pts_from_to,
                oppStats: oppStatsCopy,
                notes: 'Created via Live Stat Tracker',
                ageCategory: 'U18',
                format: '5x5',
                mode: 'team',
                attendedAthleteIds: (this.liveTracker.gameDayRosterIds && this.liveTracker.gameDayRosterIds.length > 0 ? this.liveTracker.gameDayRosterIds : Object.keys(this.liveTracker.playerStats || {})),
                attendedStaffIds: [],
                games: [newGameRound]
            };
            logs.push(newMatch);
            localStorage.setItem('atp_match_logs', JSON.stringify(logs));
            window.WellnessModule.showToast('New Match Log created from Live Session!', 'success');
        }

        const spId = this.liveTracker.periodizationMatchId || (matchId && matchId.startsWith('sp_') ? matchId.replace('sp_', '') : null);
        if (spId && window.Store.getMatches) {
            const seasonMatches = window.Store.getMatches();
            const spMatch = seasonMatches.find(m => m.id === spId);
            if (spMatch) {
                spMatch.status = 'COMPLETED';
                spMatch.atpScore = newGameRound.scoreAtp;
                spMatch.oppScore = newGameRound.scoreOpp;
                spMatch.result = newGameRound.scoreAtp >= newGameRound.scoreOpp ? 'WIN' : 'LOSS';
                spMatch.lastGameStats = newGameRound;
                
                // Add to games array so MatchLog history doesn't treat it as PENDING
                if (!spMatch.games) spMatch.games = [];
                spMatch.games.push(newGameRound);
                
                // Add attendedAthleteIds so team filters don't hide it
                if (!spMatch.attendedAthleteIds || spMatch.attendedAthleteIds.length === 0) {
                    spMatch.attendedAthleteIds = (this.liveTracker.gameDayRosterIds && this.liveTracker.gameDayRosterIds.length > 0) 
                        ? this.liveTracker.gameDayRosterIds 
                        : Object.keys(this.liveTracker.playerStats || {});
                }

                window.Store.saveMatch(spMatch);
            }
        }

        
        const targetMatchId = matchId !== 'new' ? matchId : (logs.length > 0 ? logs[logs.length-1].id : 'unknown_match');
        let workloads = JSON.parse(localStorage.getItem('personal_ams_workloads') || '[]');
        workloads = workloads.filter(w => w.matchId !== targetMatchId); // Clear old workloads for this match

        playerStats.forEach(ps => {
            if (ps.athleteId) {
                const gameLoad = (ps.min || 20) * 8.5;
                workloads.push({
                    matchId: targetMatchId,
                    id: 'wl_game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
                    athleteId: ps.athleteId,
                    date: window.Store.getLocalDateString(),
                    sessionType: 'Basketball Match Game',
                    duration: ps.min || 20,
                    rpe: 8.5,
                    load: gameLoad,
                    notes: `Match vs ${this.liveTracker.oppName} (PTS: ${ps.pts}, REB: ${ps.reb}, AST: ${ps.ast})`
                });
            }
        });
        localStorage.setItem('personal_ams_workloads', JSON.stringify(workloads));

        localStorage.removeItem('atp_live_tracker_session');
        this.resetLiveTrackerState();
        if (window.App && typeof window.App.switchView === 'function') {
            window.App.switchView('match-log');
        }
    },

    /* ═══════════════════════════════════════════════════════════════════════════
       SHOT CHART MODULE
       ═══════════════════════════════════════════════════════════════════════════ */
    toggleShotChartMode() {
        if (!this.liveTracker) return;
        this.liveTracker.shotChartEnabled = !this.liveTracker.shotChartEnabled;
        const btn = document.getElementById('live-tracker-shotchart-toggle-btn');
        if (btn) {
            if (this.liveTracker.shotChartEnabled) {
                btn.innerHTML = '<i class="fas fa-bullseye" style="color: #10B981;"></i> 🏀 Shot Chart: ON';
                btn.style.background = 'rgba(16, 185, 129, 0.2)';
                btn.style.borderColor = '#10B981';
                btn.style.color = '#10B981';
                window.WellnessModule.showToast('Shot Location Tracking Turned ON!', 'success');
            } else {
                btn.innerHTML = '<i class="fas fa-bullseye"></i> 🏀 Shot Chart: OFF';
                btn.style.background = 'rgba(255, 255, 255, 0.05)';
                btn.style.borderColor = 'rgba(255, 255, 255, 0.15)';
                btn.style.color = 'var(--text-muted)';
                window.WellnessModule.showToast('Shot Location Tracking Turned OFF', 'info');
            }
        }
        this.saveLiveTrackerSession();
    },

    openShotLocationModal(callback) {
        if (!this.liveTracker) return;
        this.liveTracker.pendingShotCallback = callback;
        const modal = document.getElementById('live-tracker-shot-location-modal');
        if (modal) modal.style.display = 'flex';
    },

    confirmShotLocation(zoneName) {
        const modal = document.getElementById('live-tracker-shot-location-modal');
        if (modal) modal.style.display = 'none';
        if (this.liveTracker && typeof this.liveTracker.pendingShotCallback === 'function') {
            const cb = this.liveTracker.pendingShotCallback;
            this.liveTracker.pendingShotCallback = null;
            cb(zoneName);
        }
    }
};
