// ─────────────────────────────────────────────────────────────────────────────
//  PeriodizationModule
//  จัดการ 2 sub-tabs ภายใน periodization-view:
//    1. Match Log  — บันทึก tournament / competition ต่างๆ
//    2. Periodization — วางแผน training phase ตลอดปี
// ─────────────────────────────────────────────────────────────────────────────

const PeriodizationModule = {
    activeSubTab: 'match-log', // 'match-log' | 'periodization'

    // ── Phase config ──────────────────────────────────────────────────────────
    PHASES: [
        { value: 'prep',  label: 'General Prep',  color: 'var(--text-secondary)',  hex: '#a1a1aa' },
        { value: 'taper', label: 'Tapering',       color: 'var(--accent-orange)',   hex: '#f87171' },
        { value: 'comp',  label: 'Competition',    color: 'var(--accent-blue)',     hex: '#ea3a2a' }
    ],

    // ── State ─────────────────────────────────────────────────────────────────
    editingPhaseId: null,
    editingMatchId: null,

    // ─────────────────────────────────────────────────────────────────────────
    init() {
        this.cacheDOM();
        this.bindEvents();
        this.switchSubTab(this.activeSubTab);
    },

    // ─────────────────────────────────────────────────────────────────────────
    cacheDOM() {
        // Sub-tab toggle buttons
        this.tabBtnMatch  = document.getElementById('period-tab-match');
        this.tabBtnPeriod = document.getElementById('period-tab-period');

        // Sub-tab content panels
        this.panelMatch  = document.getElementById('period-panel-match');
        this.panelPeriod = document.getElementById('period-panel-period');

        // ── Match Log DOM ──
        this.matchForm       = document.getElementById('match-form');
        this.matchIdInput    = document.getElementById('match-id');
        this.matchName       = document.getElementById('match-name');
        this.matchVenue      = document.getElementById('match-venue');
        this.matchDate       = document.getElementById('match-date');
        this.matchAgeGroup   = document.getElementById('match-age-group');
        this.matchAthletes   = document.getElementById('match-athletes');
        this.matchNotes      = document.getElementById('match-notes');
        this.saveMatchBtn    = document.getElementById('save-match-btn');
        this.cancelMatchBtn  = document.getElementById('cancel-match-btn');
        this.addMatchBtn     = document.getElementById('add-match-btn');
        this.matchTableBody  = document.getElementById('match-table-body');

        // ── Periodization DOM ──
        this.phaseForm       = document.getElementById('phase-form');
        this.phaseIdInput    = document.getElementById('phase-id');
        this.phaseLabel      = document.getElementById('phase-label');
        this.phaseStart      = document.getElementById('phase-start');
        this.phaseEnd        = document.getElementById('phase-end');
        this.phaseType       = document.getElementById('phase-type');
        this.phaseNotes      = document.getElementById('phase-notes');
        this.savePhaseBtn    = document.getElementById('save-phase-btn');
        this.cancelPhaseBtn  = document.getElementById('cancel-phase-btn');
        this.addPhaseBtn     = document.getElementById('add-phase-btn');
        this.phaseTimeline   = document.getElementById('phase-timeline');
        this.phaseFormTitle  = document.getElementById('phase-form-title');
    },

    // ─────────────────────────────────────────────────────────────────────────
    bindEvents() {
        // Sub-tab toggles
        if (this.tabBtnMatch)  this.tabBtnMatch.addEventListener('click',  () => this.switchSubTab('match-log'));
        if (this.tabBtnPeriod) this.tabBtnPeriod.addEventListener('click', () => this.switchSubTab('periodization'));

        // ── Match Log events ──
        if (this.addMatchBtn) {
            this.addMatchBtn.addEventListener('click', () => this.openMatchForm());
        }
        if (this.saveMatchBtn) {
            this.saveMatchBtn.addEventListener('click', () => this.saveMatch());
        }
        if (this.cancelMatchBtn) {
            this.cancelMatchBtn.addEventListener('click', () => this.closeMatchForm());
        }

        // ── Phase events ──
        if (this.addPhaseBtn) {
            this.addPhaseBtn.addEventListener('click', () => this.openPhaseForm());
        }
        if (this.savePhaseBtn) {
            this.savePhaseBtn.addEventListener('click', () => this.savePhase());
        }
        if (this.cancelPhaseBtn) {
            this.cancelPhaseBtn.addEventListener('click', () => this.closePhaseForm());
        }

        // Date auto-validate (end >= start)
        if (this.phaseStart && this.phaseEnd) {
            this.phaseStart.addEventListener('change', () => {
                if (this.phaseEnd.value && this.phaseEnd.value < this.phaseStart.value) {
                    this.phaseEnd.value = this.phaseStart.value;
                }
            });
            this.phaseEnd.addEventListener('change', () => {
                if (this.phaseStart.value && this.phaseEnd.value < this.phaseStart.value) {
                    this.phaseStart.value = this.phaseEnd.value;
                }
            });
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  Sub-Tab switching
    // ─────────────────────────────────────────────────────────────────────────
    switchSubTab(tab) {
        this.activeSubTab = tab;

        const isMatch = tab === 'match-log';

        if (this.tabBtnMatch)  this.tabBtnMatch.classList.toggle('active', isMatch);
        if (this.tabBtnPeriod) this.tabBtnPeriod.classList.toggle('active', !isMatch);
        if (this.panelMatch)   this.panelMatch.style.display  = isMatch ? 'block' : 'none';
        if (this.panelPeriod)  this.panelPeriod.style.display = isMatch ? 'none'  : 'block';

        if (isMatch) {
            this.populateAthleteCheckboxes();
            this.renderMatchTable();
        } else {
            this.renderTimeline();
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  MATCH LOG
    // ─────────────────────────────────────────────────────────────────────────

    populateAthleteCheckboxes() {
        if (!this.matchAthletes) return;
        const athletes = window.Store.getAthletesOnly();
        this.matchAthletes.innerHTML = '';
        if (athletes.length === 0) {
            this.matchAthletes.innerHTML = '<span style="color:var(--text-muted);font-size:0.85rem;">No athletes found. Add athletes in Roster first.</span>';
            return;
        }
        athletes.forEach(ath => {
            const label = document.createElement('label');
            label.className = 'athlete-checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${ath.id}" class="match-athlete-check">
                <span>${ath.fullName}</span>
                <small style="color:var(--text-muted);">${ath.team || ''}</small>
            `;
            this.matchAthletes.appendChild(label);
        });
    },

    getSelectedAthleteIds() {
        if (!this.matchAthletes) return [];
        return [...this.matchAthletes.querySelectorAll('.match-athlete-check:checked')]
            .map(cb => cb.value);
    },

    setSelectedAthleteIds(ids = []) {
        if (!this.matchAthletes) return;
        this.matchAthletes.querySelectorAll('.match-athlete-check').forEach(cb => {
            cb.checked = ids.includes(cb.value);
        });
    },

    openMatchForm(existingMatch = null) {
        if (!this.matchForm) return;
        this.matchForm.style.display = 'block';
        this.editingMatchId = existingMatch ? existingMatch.id : null;

        if (existingMatch) {
            this.matchIdInput.value  = existingMatch.id;
            this.matchName.value     = existingMatch.name || '';
            this.matchVenue.value    = existingMatch.venue || '';
            this.matchDate.value     = existingMatch.date || '';
            this.matchAgeGroup.value = existingMatch.ageGroup || '';
            this.matchNotes.value    = existingMatch.notes || '';
            this.setSelectedAthleteIds(existingMatch.athleteIds || []);
        } else {
            this.matchIdInput.value  = '';
            this.matchName.value     = '';
            this.matchVenue.value    = '';
            this.matchDate.value     = '';
            this.matchAgeGroup.value = '';
            this.matchNotes.value    = '';
            this.setSelectedAthleteIds([]);
        }
        this.matchForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    closeMatchForm() {
        if (this.matchForm) this.matchForm.style.display = 'none';
        this.editingMatchId = null;
    },

    saveMatch() {
        const name     = this.matchName.value.trim();
        const venue    = this.matchVenue.value.trim();
        const date     = this.matchDate.value;
        const ageGroup = this.matchAgeGroup.value.trim();
        const notes    = this.matchNotes.value.trim();
        const athletes = this.getSelectedAthleteIds();

        if (!name || !date) {
            this._toast('Tournament name and date are required.', 'danger');
            return;
        }

        const matchData = {
            id:         this.matchIdInput.value || 'match_' + Date.now(),
            name,
            venue,
            date,
            ageGroup,
            notes,
            athleteIds: athletes
        };

        window.Store.saveMatch(matchData);
        this._toast('Tournament saved!', 'success');
        this.closeMatchForm();
        this.renderMatchTable();
    },

    renderMatchTable() {
        if (!this.matchTableBody) return;
        let matches = (window.Store.getMatches() || []).slice();
        const matchLogs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];

        // Combine Season Planner matches and Match Logs so Season Planner table is NEVER empty if matches exist!
        const existingIds = new Set(matches.map(m => m.id));
        matchLogs.forEach(log => {
            if (!existingIds.has(log.id)) {
                let atpSum = log.atpScore || 0;
                let oppSum = log.oppScore || 0;
                if ((!atpSum && !oppSum) && log.games && log.games.length > 0) {
                    log.games.forEach(g => {
                        atpSum += parseInt(g.scoreAtp) || 0;
                        oppSum += parseInt(g.scoreOpp) || 0;
                    });
                }
                const res = atpSum > oppSum ? 'WIN' : (atpSum < oppSum ? 'LOSS' : 'DRAW');

                matches.push({
                    id: log.id,
                    name: log.title || 'Tournament Match',
                    opponent: log.opponent || 'Opponent',
                    venue: log.venue || log.opponent || 'Main Court',
                    date: log.date || window.Store.getLocalDateString(),
                    ageGroup: log.ageCategory || 'U18',
                    athleteIds: log.attendedAthleteIds || [],
                    status: 'COMPLETED',
                    atpScore: atpSum,
                    oppScore: oppSum,
                    result: res,
                    notes: log.notes || ''
                });
            }
        });

        if (matches.length === 0) {
            this.matchTableBody.innerHTML = `
                <tr>
                  <td colspan="6" style="text-align:center;color:var(--text-muted);padding:32px;">
                    No tournaments or matches recorded yet. Click "+ Add Tournament" or launch Live Stat Tracker to start!
                  </td>
                </tr>`;
            return;
        }

        // เรียงตามวันที่ใหม่สุดก่อน
        const sorted = [...matches].sort((a, b) => new Date(b.date) - new Date(a.date));
        const athletes = window.Store.getAthletes();
        const athleteMap = {};
        athletes.forEach(a => { athleteMap[a.id] = a.fullName; });

        this.matchTableBody.innerHTML = '';
        sorted.forEach(m => {
            const participantNames = (m.athleteIds || m.attendedAthleteIds || [])
                .map(id => athleteMap[id] || id)
                .join(', ') || '<span style="color:var(--text-muted)">—</span>';

            const isPast = m.status === 'COMPLETED' || m.date < window.Store.getLocalDateString();
            
            let scoreBadge = '';
            if (m.atpScore !== undefined && m.oppScore !== undefined && (m.atpScore > 0 || m.oppScore > 0)) {
                const isWin = m.atpScore >= m.oppScore;
                const badgeBg = isWin ? 'var(--text-primary)' : 'var(--bg-secondary)';
                const badgeColor = isWin ? 'var(--bg-primary)' : 'var(--text-muted)';
                const borderColor = isWin ? 'var(--text-primary)' : 'var(--border-color)';
                
                scoreBadge = `<span style="font-family: 'Courier Prime', monospace; font-weight: bold; font-size: 0.78rem; background: ${badgeBg}; padding: 2px 6px; border-radius: 0; border: 1px solid ${borderColor}; color: ${badgeColor}; margin-left: 6px; box-shadow: 2px 2px 0px var(--border-color);">${m.atpScore} - ${m.oppScore} ${m.result || ''}</span>`;
            }

            const statusBadge = m.status === 'COMPLETED'
                ? `<span class="period-badge badge-past" style="background: var(--bg-secondary); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: 0; box-shadow: 2px 2px 0px var(--border-color); font-family: 'Courier Prime', monospace;">COMPLETED</span>`
                : (isPast ? `<span class="period-badge badge-past" style="border-radius: 0; font-family: 'Courier Prime', monospace; border: 1px solid var(--border-color); color: var(--text-muted);">PAST</span>` : `<span class="period-badge badge-upcoming" style="border-radius: 0; font-family: 'Courier Prime', monospace; border: 1px solid var(--text-primary); background: var(--text-primary); color: var(--bg-primary);">UPCOMING</span>`);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="font-weight:600; display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">
                        <span>${m.name}</span>
                        ${scoreBadge}
                    </div>
                    ${m.notes ? `<div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${m.notes}</div>` : ''}
                </td>
                <td>${m.venue || m.opponent || '—'}</td>
                <td>${m.date}</td>
                <td>${m.ageGroup || m.ageCategory || '—'}</td>
                <td style="font-size:0.82rem;">${participantNames}</td>
                <td style="white-space:nowrap; text-align: right;">
                    ${statusBadge}
                    <button class="btn btn-primary btn-sm" onclick="window.App.launchLiveTrackerForMatch('${m.id}')" style="margin-left:6px; padding: 3px 8px; font-size: 0.72rem;" title="Launch Live Stat Console">
                        <i class="fas fa-basketball-ball"></i> Track Live
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.App.openDetailedMatchReport('sp_${m.id}')" style="margin-left:4px; padding: 3px 8px; font-size: 0.72rem;" title="View Detailed Match Report & Box Score">
                        <i class="fas fa-file-invoice"></i> Report
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.PeriodizationModule.editMatch('${m.id}')" style="margin-left:4px; padding: 3px 6px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.PeriodizationModule.deleteMatch('${m.id}')" style="margin-left:4px; padding: 3px 6px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            this.matchTableBody.appendChild(tr);
        });
    },

    editMatch(id) {
        const match = window.Store.getMatches().find(m => m.id === id);
        if (match) this.openMatchForm(match);
    },

    deleteMatch(id) {
        if (confirm('Delete this tournament record?')) {
            window.Store.deleteMatch(id);
            this.renderMatchTable();
            this._toast('Tournament deleted.', 'info');
        }
    },

    // ─────────────────────────────────────────────────────────────────────────
    //  PERIODIZATION (Training Phase Blocks / Gantt Chart)
    // ─────────────────────────────────────────────────────────────────────────

    openPhaseForm(existingPhase = null) {
        if (!this.phaseForm) return;
        this.phaseForm.style.display = 'block';
        this.editingPhaseId = existingPhase ? existingPhase.id : null;

        if (existingPhase) {
            this.phaseFormTitle.textContent = 'Edit Training Phase';
            this.phaseIdInput.value  = existingPhase.id;
            this.phaseLabel.value    = existingPhase.label || '';
            this.phaseStart.value    = existingPhase.startDate || '';
            this.phaseEnd.value      = existingPhase.endDate || '';
            this.phaseType.value     = existingPhase.type || 'prep';
            this.phaseNotes.value    = existingPhase.notes || '';
        } else {
            this.phaseFormTitle.textContent = 'Add Training Phase';
            this.phaseIdInput.value  = '';
            this.phaseLabel.value    = '';
            this.phaseStart.value    = '';
            this.phaseEnd.value      = '';
            this.phaseType.value     = 'prep';
            this.phaseNotes.value    = '';
        }
        this.phaseForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },

    closePhaseForm() {
        if (this.phaseForm) this.phaseForm.style.display = 'none';
        this.editingPhaseId = null;
    },

    savePhase() {
        const label     = this.phaseLabel.value.trim();
        const startDate = this.phaseStart.value;
        const endDate   = this.phaseEnd.value;
        const type      = this.phaseType.value;
        const notes     = this.phaseNotes.value.trim();
        const athleteId = window.App ? window.App.currentAthleteId : null;

        if (!label || !startDate || !endDate) {
            this._toast('Label, start date and end date are required.', 'danger');
            return;
        }
        if (endDate < startDate) {
            this._toast('End date must be after start date.', 'danger');
            return;
        }

        const phaseData = {
            id:        this.phaseIdInput.value || 'phase_' + Date.now(),
            athleteId,
            label,
            startDate,
            endDate,
            type,
            notes
        };

        window.Store.savePhase(phaseData);
        this._toast('Training phase saved!', 'success');
        this.closePhaseForm();
        this.renderTimeline();
    },

    renderTimeline() {
        if (!this.phaseTimeline) return;
        const athleteId = window.App ? window.App.currentAthleteId : null;
        if (!athleteId) {
            this.phaseTimeline.innerHTML = `
                <div class="period-empty">
                    <i class="fas fa-calendar-alt" style="font-size:2.5rem;color:var(--text-muted);margin-bottom:12px;"></i>
                    <p>No athlete selected.</p>
                </div>`;
            return;
        }

        const phases = window.Store.getPhases(athleteId)
                            .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
        const matches = window.Store.getMatches()
                            .filter(m => m.athleteIds && m.athleteIds.includes(athleteId))
                            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (phases.length === 0 && matches.length === 0) {
            this.phaseTimeline.innerHTML = `
                <div class="period-empty">
                    <i class="fas fa-calendar-alt" style="font-size:2.5rem;color:var(--text-muted);margin-bottom:12px;"></i>
                    <p>No training phases or tournaments planned.</p>
                    <small style="color:var(--text-muted);">Click "+ Add Phase" or go to Match Log to add tournaments.</small>
                </div>`;
            return;
        }

        this.phaseTimeline.innerHTML = '';

        // หา Min Date และ Max Date เพื่อสร้าง Continuous responsive scale
        const allDates = [];
        phases.forEach(p => {
            if (p.startDate) {
                const d = new Date(p.startDate);
                if (!isNaN(d.getTime())) allDates.push(d);
            }
            if (p.endDate) {
                const d = new Date(p.endDate);
                if (!isNaN(d.getTime())) allDates.push(d);
            }
        });
        matches.forEach(m => {
            if (m.date) {
                const d = new Date(m.date);
                if (!isNaN(d.getTime())) allDates.push(d);
            }
        });

        if (allDates.length === 0) return;

        const minDate = new Date(Math.min(...allDates));
        const maxDate = new Date(Math.max(...allDates));
        const totalMs = maxDate - minDate || 1;

        const phaseConfig = {};
        this.PHASES.forEach(p => { phaseConfig[p.value] = p; });

        // สร้าง Gantt Container
        const ganttContainer = document.createElement('div');
        ganttContainer.className = 'gantt-container';
        ganttContainer.style.display = 'flex';
        ganttContainer.style.flexDirection = 'column';
        ganttContainer.style.gap = '16px';
        ganttContainer.style.position = 'relative';

        // 1. วาด แทร็กของแต่ละ Phase
        phases.forEach(phase => {
            const cfg = phaseConfig[phase.type] || this.PHASES[0];
            const startMs = new Date(phase.startDate) - minDate;
            const durationMs = new Date(phase.endDate) - new Date(phase.startDate);
            const leftPct = (startMs / totalMs) * 100;
            const widthPct = Math.max((durationMs / totalMs) * 100, 2);

            const days = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;

            const row = document.createElement('div');
            row.className = 'gantt-row';
            row.style.display = 'flex';
            row.style.alignItems = 'center';
            row.style.gap = '20px';
            row.style.padding = '8px 0';
            row.style.position = 'relative';

            row.innerHTML = `
                <div class="gantt-meta" style="width: 240px; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                    <span class="phase-dot" style="background:${cfg.color}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>
                    <div style="flex-grow: 1;">
                        <div class="phase-block-label" style="font-weight: 600; font-size: 0.9rem;">${phase.label}</div>
                        <div class="phase-block-dates" style="font-size: 0.72rem; color: var(--text-muted);">${phase.startDate} → ${phase.endDate} (${days}d)</div>
                    </div>
                </div>
                <div class="gantt-track-wrapper" style="flex-grow: 1; height: 32px; background: rgba(255,255,255,0.02); border-radius: var(--border-radius-sm); position: relative; overflow: visible;">
                    <div class="phase-bar-fill" style="
                        position: absolute;
                        left: ${leftPct.toFixed(1)}%;
                        width: ${widthPct.toFixed(1)}%;
                        height: 20px;
                        top: 6px;
                        background: ${cfg.color};
                        border-radius: var(--border-radius-sm);
                        display: flex;
                        align-items: center;
                        padding-left: 8px;
                        font-size: 0.7rem;
                        font-weight: 600;
                        color: #fff;
                        box-shadow: 0 0 10px rgba(234, 58, 42, 0.15);
                    " title="${cfg.label}: ${phase.startDate} → ${phase.endDate}">
                        ${cfg.label}
                    </div>
                </div>
                <div class="phase-block-actions" style="display: flex; gap: 6px;">
                    <button class="btn btn-secondary btn-sm" onclick="window.PeriodizationModule.editPhase('${phase.id}')" style="padding: 4px 8px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.PeriodizationModule.deletePhase('${phase.id}')" style="padding: 4px 8px;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            ganttContainer.appendChild(row);
        });

        // 2. วาด แทร็กปักหมุด Tournament / Matches
        if (matches.length > 0) {
            const matchRow = document.createElement('div');
            matchRow.className = 'gantt-row match-timeline-row';
            matchRow.style.display = 'flex';
            matchRow.style.alignItems = 'center';
            matchRow.style.gap = '20px';
            matchRow.style.padding = '16px 0';
            matchRow.style.position = 'relative';

            let pinsHTML = '';
            matches.forEach(m => {
                const matchMs = new Date(m.date) - minDate;
                const leftPct = (matchMs / totalMs) * 100;

                pinsHTML += `
                    <div class="gantt-match-pin" style="
                        position: absolute;
                        left: ${leftPct.toFixed(1)}%;
                        top: -10px;
                        bottom: -10px;
                        width: 2px;
                        background: var(--accent-orange);
                        box-shadow: 0 0 8px var(--accent-orange);
                        z-index: 10;
                    " title="${m.name} (${m.date})">
                        <div style="
                            position: absolute;
                            top: -18px;
                            left: -10px;
                            font-size: 1.1rem;
                            cursor: pointer;
                            filter: drop-shadow(0 0 4px rgba(248, 113, 113, 0.6));
                        " onclick="window.PeriodizationModule.switchSubTab('match-log')">🏆</div>
                        <div style="
                            position: absolute;
                            bottom: -18px;
                            left: -30px;
                            width: 60px;
                            text-align: center;
                            font-size: 0.65rem;
                            color: var(--accent-orange);
                            font-family: 'VT323', monospace;
                        ">${m.date}</div>
                    </div>
                `;
            });

            matchRow.innerHTML = `
                <div class="gantt-meta" style="width: 240px; flex-shrink: 0; display: flex; align-items: center; gap: 8px;">
                    <i class="fas fa-trophy" style="color: var(--accent-orange); font-size: 1.1rem;"></i>
                    <div>
                        <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-orange);">Tournaments Pin</div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">Competition dates</div>
                    </div>
                </div>
                <div class="gantt-track-wrapper" style="flex-grow: 1; height: 32px; background: rgba(248, 113, 113, 0.03); border: 1px dashed rgba(248, 113, 113, 0.2); border-radius: var(--border-radius-sm); position: relative; overflow: visible;">
                    ${pinsHTML}
                </div>
                <div class="phase-block-actions" style="width: 68px; flex-shrink: 0; visibility: hidden;"></div>
            `;
            ganttContainer.appendChild(matchRow);
        }

        this.phaseTimeline.appendChild(ganttContainer);

        // วาด legend
        const legend = document.createElement('div');
        legend.className = 'phase-legend';
        this.PHASES.forEach(p => {
            const item = document.createElement('div');
            item.className = 'phase-legend-item';
            item.innerHTML = `<span class="phase-dot" style="background:${p.color};"></span>${p.label}`;
            legend.appendChild(item);
        });
        this.phaseTimeline.appendChild(legend);
    },

    editPhase(id) {
        const phase = window.Store.getPhases().find(p => p.id === id);
        if (phase) this.openPhaseForm(phase);
    },

    deletePhase(id) {
        if (confirm('Delete this training phase?')) {
            window.Store.deletePhase(id);
            this.renderTimeline();
            this._toast('Training phase deleted.', 'info');
        }
    },

    // ── Called when athlete switches globally ─────────────────────────────────
    refresh() {
        if (this.activeSubTab === 'match-log') {
            this.populateAthleteCheckboxes();
            this.renderMatchTable();
        } else {
            this.renderTimeline();
        }
    },

    // ── Utility: show toast via WellnessModule ────────────────────────────────
    _toast(msg, type = 'info') {
        if (window.WellnessModule && window.WellnessModule.showToast) {
            window.WellnessModule.showToast(msg, type);
        }
    }
};

window.PeriodizationModule = PeriodizationModule;
