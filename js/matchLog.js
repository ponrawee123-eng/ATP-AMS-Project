/* ═══════════════════════════════════════════════════════════════════════
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
init() {
        this.editingMatchLogId = null;
        if (this.saveMatchLogBtn) {
            this.saveMatchLogBtn.innerHTML = '<i class="fas fa-save"></i> Save Match Log';
        }

        this.renderMatchLogAttendance();
        this.renderMatchHistoryTable();
        this.renderMatchLogStaff();
        this.populateMatchLogTeamFilter();
        
        if (this.matchLogTitle) this.matchLogTitle.value = '';
        if (this.matchLogOpponent) this.matchLogOpponent.value = '';
        if (this.matchLogNotes) this.matchLogNotes.value = '';
        if (this.matchLogEndDate) this.matchLogEndDate.value = '';
        if (this.matchLogDate) {
            this.matchLogDate.value = window.Store.getLocalDateString();
        }

        const ageSelect = document.getElementById('match-log-age-category');
        if (ageSelect) ageSelect.selectedIndex = 0;

        const formatSelect = document.getElementById('match-log-format');
        if (formatSelect) formatSelect.selectedIndex = 0;

        const gamesList = document.getElementById('match-log-games-list');
        if (gamesList) gamesList.innerHTML = '';

        const iconPreview = document.getElementById('match-log-icon-preview');
        if (iconPreview) {
            iconPreview.innerHTML = '<i class="fas fa-trophy" style="color: var(--text-muted); font-size: 0.9rem;"></i>';
        }
        const iconData = document.getElementById('match-log-icon-data');
        if (iconData) {
            iconData.value = '';
        }

        this.setMatchLogMode('team');
    },

    populateMatchLogTeamFilter() {
        const filter = document.getElementById('match-log-team-filter');
        const historyFilter = document.getElementById('match-log-history-team-filter');
        const analyticsSelect = document.getElementById('tournament-analytics-select');
        
        if (filter) filter.innerHTML = '<option value="all">All Teams</option>';
        if (historyFilter) historyFilter.innerHTML = '<option value="all">All Teams</option>';
        if (analyticsSelect) analyticsSelect.innerHTML = '<option value="all">All Tournaments</option>';

        const athletes = window.Store.getAthletesOnly();
        const teams = [...new Set(athletes.map(ath => ath.team).filter(t => t && t.trim() !== ''))];
        teams.sort().forEach(team => {
            if (filter) {
                const opt = document.createElement('option');
                opt.value = team;
                opt.textContent = team;
                filter.appendChild(opt);
            }
            if (historyFilter) {
                const opt2 = document.createElement('option');
                opt2.value = team;
                opt2.textContent = team;
                historyFilter.appendChild(opt2);
            }
        });

        // Populate tournament options for analytics
        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const tournamentTitles = [...new Set(logs.map(l => l.title).filter(Boolean))];
        tournamentTitles.sort().forEach(title => {
            if (analyticsSelect) {
                const opt = document.createElement('option');
                opt.value = title;
                opt.textContent = title;
                analyticsSelect.appendChild(opt);
            }
        });
    },

    filterMatchLogAttendance() {
        const filter = document.getElementById('match-log-team-filter');
        if (!filter) return;
        const selectedTeam = filter.value;
        
        if (!this.matchLogAttendanceGrid) return;
        const labels = this.matchLogAttendanceGrid.querySelectorAll('.athlete-checkbox-label');
        labels.forEach(label => {
            const team = label.getAttribute('data-team') || '';
            const cb = label.querySelector('.match-attendance-checkbox');
            if (selectedTeam === 'all') {
                label.style.display = 'flex';
            } else if (team === selectedTeam) {
                label.style.display = 'flex';
                if (cb) cb.checked = true;
            } else {
                label.style.display = 'none';
                if (cb) cb.checked = false;
            }
        });
    },

    handleMatchLogIconSelect(inputEl) {
        const file = inputEl.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const max_size = 128;
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                
                const previewDiv = document.getElementById('match-log-icon-preview');
                const hiddenInput = document.getElementById('match-log-icon-data');
                
                if (previewDiv && hiddenInput) {
                    previewDiv.innerHTML = `<img src="${compressedBase64}" style="width: 100%; height: 100%; object-fit: cover;">`;
                    hiddenInput.value = compressedBase64;
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    setMatchLogMode(mode) {
        const teamBtn = document.getElementById('match-log-mode-team');
        const indivBtn = document.getElementById('match-log-mode-indiv');
        const attendanceContainer = document.getElementById('match-log-attendance-container');
        const athleteSelectContainer = document.getElementById('match-log-athlete-select-container');
        
        if (mode === 'team') {
            if (teamBtn) {
                teamBtn.classList.add('active');
                teamBtn.style.background = 'var(--accent-blue)';
                teamBtn.style.borderColor = 'var(--accent-blue)';
                teamBtn.style.color = 'var(--text-primary)';
            }
            if (indivBtn) {
                indivBtn.classList.remove('active');
                indivBtn.style.background = '';
                indivBtn.style.borderColor = '';
                indivBtn.style.color = '';
            }
            if (attendanceContainer) attendanceContainer.style.display = 'block';
            if (athleteSelectContainer) athleteSelectContainer.style.display = 'none';
            this.matchLogMode = 'team';
        } else {
            if (indivBtn) {
                indivBtn.classList.add('active');
                indivBtn.style.background = 'var(--accent-blue)';
                indivBtn.style.borderColor = 'var(--accent-blue)';
                indivBtn.style.color = 'var(--text-primary)';
            }
            if (teamBtn) {
                teamBtn.classList.remove('active');
                teamBtn.style.background = '';
                teamBtn.style.borderColor = '';
                teamBtn.style.color = '';
            }
            if (attendanceContainer) attendanceContainer.style.display = 'none';
            if (athleteSelectContainer) athleteSelectContainer.style.display = 'block';
            this.matchLogMode = 'individual';
            
            // Populate athlete select
            const select = document.getElementById('match-log-athlete-select');
            if (select) {
                select.innerHTML = '';
                const athletes = window.Store.getAthletesOnly();
                athletes.forEach(ath => {
                    const opt = document.createElement('option');
                    opt.value = ath.id;
                    opt.textContent = this.getAthleteDisplayName(ath);
                    select.appendChild(opt);
                });
            }
        }
    },

    renderMatchLogAttendance() {
        if (!this.matchLogAttendanceGrid) return;
        this.matchLogAttendanceGrid.innerHTML = '';

        const athletes = window.Store.getAthletesOnly();
        if (athletes.length === 0) {
            this.matchLogAttendanceGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">No athletes available in roster.</div>';
            return;
        }

        athletes.forEach(ath => {
            const label = document.createElement('label');
            label.className = 'athlete-checkbox-label';
            label.setAttribute('data-team', ath.team || '');
            label.innerHTML = `
                <input type="checkbox" value="${ath.id}" class="match-attendance-checkbox">
                <span>${this.getAthleteDisplayName(ath)}</span>
            `;
            this.matchLogAttendanceGrid.appendChild(label);
        });
    },

    renderMatchLogStaff() {
        const grid = document.getElementById('match-log-staff-grid');
        if (!grid) return;
        grid.innerHTML = '';
        
        const staffList = window.Store.getStaffOnly();
        
        staffList.forEach(st => {
            const label = document.createElement('label');
            label.className = 'athlete-checkbox-label';
            label.innerHTML = `
                <input type="checkbox" value="${st.id}" class="match-staff-checkbox">
                <span>${st.fullName || st.name} <small style="color: var(--text-muted);">(${st.team || 'Staff'})</small></span>
            `;
            grid.appendChild(label);
        });
    },
    
    addNewStaffFromLog() {
        const nameInput = document.getElementById('match-log-new-staff-name');
        if (!nameInput) return;
        const name = nameInput.value.trim();
        if (!name) return;
        
        const newStaff = {
            id: 'athlete_' + Date.now(),
            fullName: name,
            nickname: '',
            dob: '',
            team: '',
            role: 'staff',
            photo: '',
            performanceLogs: []
        };
        window.Store.saveAthlete(newStaff);
        
        nameInput.value = '';
        this.renderMatchLogStaff();
        
        // Auto check the newly added staff member
        setTimeout(() => {
            const checkboxes = document.querySelectorAll('.match-staff-checkbox');
            checkboxes.forEach(cb => {
                if (cb.value === newStaff.id) {
                    cb.checked = true;
                }
            });
        }, 50);
    },

    addNewGameRow(gameData = null) {
        const container = document.getElementById('match-log-games-list');
        if (!container) return;
        
        const gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
        const gameIndex = container.children.length + 1;
        
        const card = document.createElement('div');
        card.className = 'game-round-card';
        card.id = gameId;
        card.style = 'border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 8px; padding: 12px; background: rgba(255, 255, 255, 0.02); display: flex; flex-direction: column; gap: 10px; position: relative;';
        
        const stageVal = gameData ? (gameData.stage || 'Group Stage') : 'Group Stage';
        const opponentVal = gameData ? (gameData.opponent || '') : '';
        const scoreAtpVal = gameData ? (gameData.scoreAtp !== undefined ? gameData.scoreAtp : '') : '';
        const scoreOppVal = gameData ? (gameData.scoreOpp !== undefined ? gameData.scoreOpp : '') : '';
        const statsVal = gameData ? (gameData.stats || '') : '';
        const notesVal = gameData ? (gameData.notes || '') : '';
        const imgDataVal = gameData ? (gameData.imageData || '') : '';
        const playerStatsArr = gameData ? (gameData.playerStats || []) : [];
        
        // Attended or selected athletes for box score matrix
        let availableAthletes = [];
        if (this.matchLogMode === 'individual') {
            const targetId = document.getElementById('match-log-athlete-select')?.value;
            const targetAth = window.Store.getAthletesOnly().find(a => a.id === targetId);
            if (targetAth) availableAthletes = [targetAth];
        } else {
            const checkedBoxes = document.querySelectorAll('.match-attendance-checkbox');
            const attendedIds = Array.from(checkedBoxes).filter(cb => cb.checked).map(cb => cb.value);
            const allAthletes = window.Store.getAthletesOnly();
            availableAthletes = allAthletes.filter(a => attendedIds.includes(a.id));
            if (availableAthletes.length === 0) availableAthletes = allAthletes.slice(0, 10);
        }

        let boxScoreRowsHtml = '';
        availableAthletes.forEach(ath => {
            const existingStat = playerStatsArr.find(ps => ps.athleteId === ath.id) || {};
            const min = existingStat.min !== undefined ? existingStat.min : '';
            const pts = existingStat.pts !== undefined ? existingStat.pts : '';
            const reb = existingStat.reb !== undefined ? existingStat.reb : '';
            const ast = existingStat.ast !== undefined ? existingStat.ast : '';
            const stl = existingStat.stl !== undefined ? existingStat.stl : '';
            const blk = existingStat.blk !== undefined ? existingStat.blk : '';
            const to = existingStat.to !== undefined ? existingStat.to : '';
            const pf = existingStat.pf !== undefined ? existingStat.pf : '';
            const pm = existingStat.plusMinus !== undefined ? existingStat.plusMinus : '';
            const fgm = existingStat.fgm !== undefined ? existingStat.fgm : '';
            const fga = existingStat.fga !== undefined ? existingStat.fga : '';
            const eff = existingStat.eff !== undefined ? existingStat.eff : '-';

            boxScoreRowsHtml += `
                <tr data-athlete-id="${ath.id}">
                    <td style="padding: 4px 6px; font-weight: 500; white-space: nowrap; color: var(--text-primary); font-size: 0.75rem;">${this.getAthleteDisplayName(ath)}</td>
                    <td style="padding: 2px;"><input type="number" class="ps-min form-control" value="${min}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-pts form-control" value="${pts}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center; font-weight: bold; color: var(--accent-orange);" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-reb form-control" value="${reb}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-ast form-control" value="${ast}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-stl form-control" value="${stl}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-blk form-control" value="${blk}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-to form-control" value="${to}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-pf form-control" value="${pf}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-fgm form-control" value="${fgm}" placeholder="0" style="width: 40px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-fga form-control" value="${fga}" placeholder="0" style="width: 40px; padding: 2px 4px; font-size: 0.75rem; text-align: center;" oninput="window.App.calcGameBoxScoreEff('${gameId}')"></td>
                    <td style="padding: 2px;"><input type="number" class="ps-pm form-control" value="${pm}" placeholder="0" style="width: 45px; padding: 2px 4px; font-size: 0.75rem; text-align: center;"></td>
                    <td style="padding: 4px 6px; text-align: center; font-weight: bold; color: var(--accent-blue); font-size: 0.75rem;" class="ps-eff-val">${eff}</td>
                </tr>
            `;
        });

        card.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: bold; font-size: 0.85rem; color: var(--accent-blue);">Game #${gameIndex}</span>
                <button type="button" class="btn btn-danger btn-sm" onclick="document.getElementById('${gameId}').remove()" style="padding: 2px 6px; font-size: 0.75rem;"><i class="fas fa-times"></i> Remove</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.75rem;">Tournament Stage / Round *</label>
                    <select class="form-control game-stage" style="padding: 4px 8px; font-size: 0.8rem; height: 30px;">
                        <option value="Group Stage" ${stageVal === 'Group Stage' ? 'selected' : ''}>Group Stage</option>
                        <option value="Group Stage - Game 1" ${stageVal === 'Group Stage - Game 1' ? 'selected' : ''}>Group Stage - Game 1</option>
                        <option value="Group Stage - Game 2" ${stageVal === 'Group Stage - Game 2' ? 'selected' : ''}>Group Stage - Game 2</option>
                        <option value="Group Stage - Game 3" ${stageVal === 'Group Stage - Game 3' ? 'selected' : ''}>Group Stage - Game 3</option>
                        <option value="Quarterfinals" ${stageVal === 'Quarterfinals' ? 'selected' : ''}>Quarterfinals</option>
                        <option value="Semifinals" ${stageVal === 'Semifinals' ? 'selected' : ''}>Semifinals</option>
                        <option value="Finals" ${stageVal === 'Finals' ? 'selected' : ''}>Finals</option>
                        <option value="3rd Place Match" ${stageVal === '3rd Place Match' ? 'selected' : ''}>3rd Place Match</option>
                        <option value="Friendly / Exhibition" ${stageVal === 'Friendly / Exhibition' ? 'selected' : ''}>Friendly / Exhibition</option>
                    </select>
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.75rem;">Opponent Name *</label>
                    <input type="text" class="form-control game-opponent" placeholder="e.g. International Tigers" value="${opponentVal}" style="padding: 4px 8px; font-size: 0.8rem; height: 30px;">
                </div>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.75rem;">ATP Score</label>
                    <input type="number" class="form-control game-score-atp" placeholder="0" value="${scoreAtpVal}" style="padding: 4px 8px; font-size: 0.8rem; height: 30px;">
                </div>
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-size: 0.75rem;">Opponent Score</label>
                    <input type="number" class="form-control game-score-opp" placeholder="0" value="${scoreOppVal}" style="padding: 4px 8px; font-size: 0.8rem; height: 30px;">
                </div>
            </div>

            <!-- Expandable Player Box Score Table -->
            <div style="border: 1px solid rgba(255,255,255,0.08); border-radius: 6px; padding: 8px; background: rgba(0,0,0,0.2);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 0.75rem; font-weight: bold; color: var(--accent-orange);">
                        <i class="fas fa-list-ol"></i> Player Box Score Matrix (FIBA Rating)
                    </span>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.toggleGameBoxScore('${gameId}')" style="font-size: 0.68rem; padding: 2px 6px;">
                        Toggle Box Score
                    </button>
                </div>
                <div id="${gameId}_boxscore_wrapper" style="overflow-x: auto; max-height: 250px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 0.72rem;">
                        <thead>
                            <tr style="border-bottom: 1px solid rgba(255,255,255,0.1); color: var(--text-muted); text-align: center;">
                                <th style="text-align: left; padding: 4px;">Player</th>
                                <th>MIN</th>
                                <th style="color: var(--accent-orange);">PTS</th>
                                <th>REB</th>
                                <th>AST</th>
                                <th>STL</th>
                                <th>BLK</th>
                                <th>TO</th>
                                <th>PF</th>
                                <th>FGM</th>
                                <th>FGA</th>
                                <th>+/-</th>
                                <th style="color: var(--accent-blue);">EFF</th>
                            </tr>
                        </thead>
                        <tbody class="game-box-score-body">
                            ${boxScoreRowsHtml || '<tr><td colspan="13" style="text-align: center; color: var(--text-muted); padding: 8px;">Select players in attendance check above first.</td></tr>'}
                        </tbody>
                    </table>
                </div>
            </div>

            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.75rem;">Game Quick Notes / Summary</label>
                <input type="text" class="form-control game-stats" placeholder="e.g. 1st Half lead +8, Key Rebounds by JD" value="${statsVal}" style="padding: 4px 8px; font-size: 0.8rem; height: 30px;">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.75rem;">Game Tactical Notes</label>
                <textarea class="form-control game-notes" rows="2" placeholder="Tactical notes for this game..." style="padding: 4px 8px; font-size: 0.8rem;">${notesVal}</textarea>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
                <label style="font-size: 0.75rem;">Upload Game Photo / Stat Sheet</label>
                <input type="file" class="game-image-input" accept="image/*" style="font-size: 0.75rem; border: none; padding: 0;" onchange="window.App.handleGamePhotoSelect(this, '${gameId}')">
                <div class="game-image-preview" style="margin-top: 8px; max-height: 120px; display: ${imgDataVal ? 'block' : 'none'};">
                    <img src="${imgDataVal}" style="max-height: 100px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.2);">
                    <input type="hidden" class="game-image-data" value="${imgDataVal}">
                </div>
            </div>
        `;
        container.appendChild(card);
    },

    toggleGameBoxScore(gameId) {
        const wrapper = document.getElementById(`${gameId}_boxscore_wrapper`);
        if (wrapper) {
            wrapper.style.display = wrapper.style.display === 'none' ? 'block' : 'none';
        }
    },

    calcGameBoxScoreEff(gameId) {
        const card = document.getElementById(gameId);
        if (!card) return;
        const rows = card.querySelectorAll('.game-box-score-body tr');
        let totalPts = 0;

        rows.forEach(tr => {
            const pts = parseInt(tr.querySelector('.ps-pts')?.value) || 0;
            const reb = parseInt(tr.querySelector('.ps-reb')?.value) || 0;
            const ast = parseInt(tr.querySelector('.ps-ast')?.value) || 0;
            const stl = parseInt(tr.querySelector('.ps-stl')?.value) || 0;
            const blk = parseInt(tr.querySelector('.ps-blk')?.value) || 0;
            const to = parseInt(tr.querySelector('.ps-to')?.value) || 0;
            const fgm = parseInt(tr.querySelector('.ps-fgm')?.value) || 0;
            const fga = parseInt(tr.querySelector('.ps-fga')?.value) || 0;
            
            totalPts += pts;

            // FIBA Efficiency calculation
            let missedFg = fga > fgm ? (fga - fgm) : 0;
            let eff = (pts + reb + ast + stl + blk) - (missedFg + to);
            
            const effCell = tr.querySelector('.ps-eff-val');
            if (effCell) effCell.textContent = eff;
        });

        // Auto-update ATP Score if PTS was entered in box score
        const scoreAtpInput = card.querySelector('.game-score-atp');
        if (scoreAtpInput && totalPts > 0) {
            scoreAtpInput.value = totalPts;
        }
    },

    handleGamePhotoSelect(inputEl, cardId) {
        const file = inputEl.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;
                
                const max_size = 1000;
                if (width > height) {
                    if (width > max_size) {
                        height *= max_size / width;
                        width = max_size;
                    }
                } else {
                    if (height > max_size) {
                        width *= max_size / height;
                        height = max_size;
                    }
                }
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                const compressedBase64 = canvas.toDataURL('image/jpeg', 0.85);
                
                const cardEl = document.getElementById(cardId);
                if (cardEl) {
                    const previewDiv = cardEl.querySelector('.game-image-preview');
                    const previewImg = cardEl.querySelector('.game-image-preview img');
                    const hiddenInput = cardEl.querySelector('.game-image-data');
                    
                    if (previewDiv && previewImg && hiddenInput) {
                        previewImg.src = compressedBase64;
                        previewDiv.style.display = 'block';
                        hiddenInput.value = compressedBase64;
                    }
                }
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    },

    saveMatchLog() {
        if (!this.checkAdminPermission()) return;
        const title = this.matchLogTitle?.value.trim();
        const date = this.matchLogDate?.value;
        const endDate = this.matchLogEndDate?.value || '';
        const notes = this.matchLogNotes?.value.trim();

        if (!title || !date) {
            window.WellnessModule.showToast('Please fill all required fields (*).', 'danger');
            return;
        }

        let attendedAthleteIds = [];
        let athleteId = '';

        if (this.matchLogMode === 'individual') {
            athleteId = document.getElementById('match-log-athlete-select')?.value || '';
            if (!athleteId) {
                window.WellnessModule.showToast('Please select an athlete.', 'danger');
                return;
            }
            attendedAthleteIds = [athleteId];
        } else {
            const checkedBoxes = document.querySelectorAll('.match-attendance-checkbox');
            attendedAthleteIds = Array.from(checkedBoxes).filter(cb => cb.checked).map(cb => cb.value);
            if (attendedAthleteIds.length === 0) {
                window.WellnessModule.showToast('Please select at least one attending player.', 'danger');
                return;
            }
        }

        const attendedStaffIds = Array.from(document.querySelectorAll('.match-staff-checkbox')).filter(cb => cb.checked).map(cb => cb.value);

        // Parse games details
        const games = [];
        const gameCards = document.querySelectorAll('#match-log-games-list .game-round-card');
        gameCards.forEach(card => {
            const stage = card.querySelector('.game-stage')?.value || 'Group Stage';
            const opponent = card.querySelector('.game-opponent')?.value.trim() || '';
            const scoreAtp = card.querySelector('.game-score-atp')?.value.trim() || '0';
            const scoreOpp = card.querySelector('.game-score-opp')?.value.trim() || '0';
            const stats = card.querySelector('.game-stats')?.value.trim() || '';
            const notes = card.querySelector('.game-notes')?.value.trim() || '';
            const imageData = card.querySelector('.game-image-data')?.value || '';
            
            // Scrape Player Box Score matrix
            const playerStats = [];
            const trs = card.querySelectorAll('.game-box-score-body tr');
            trs.forEach(tr => {
                const athleteId = tr.getAttribute('data-athlete-id');
                if (!athleteId) return;
                const min = parseInt(tr.querySelector('.ps-min')?.value) || 0;
                const pts = parseInt(tr.querySelector('.ps-pts')?.value) || 0;
                const reb = parseInt(tr.querySelector('.ps-reb')?.value) || 0;
                const ast = parseInt(tr.querySelector('.ps-ast')?.value) || 0;
                const stl = parseInt(tr.querySelector('.ps-stl')?.value) || 0;
                const blk = parseInt(tr.querySelector('.ps-blk')?.value) || 0;
                const to = parseInt(tr.querySelector('.ps-to')?.value) || 0;
                const pf = parseInt(tr.querySelector('.ps-pf')?.value) || 0;
                const fgm = parseInt(tr.querySelector('.ps-fgm')?.value) || 0;
                const fga = parseInt(tr.querySelector('.ps-fga')?.value) || 0;
                const plusMinus = parseInt(tr.querySelector('.ps-pm')?.value) || 0;
                let missedFg = fga > fgm ? (fga - fgm) : 0;
                let eff = (pts + reb + ast + stl + blk) - (missedFg + to);

                if (min > 0 || pts > 0 || reb > 0 || ast > 0 || stl > 0 || blk > 0 || to > 0 || pf > 0 || plusMinus !== 0) {
                    playerStats.push({
                        athleteId,
                        min,
                        pts,
                        reb,
                        ast,
                        stl,
                        blk,
                        to,
                        pf,
                        fgm,
                        fga,
                        plusMinus,
                        eff
                    });
                }
            });

            games.push({
                stage,
                opponent,
                scoreAtp: parseInt(scoreAtp) || 0,
                scoreOpp: parseInt(scoreOpp) || 0,
                stats,
                notes,
                imageData,
                playerStats
            });
        });

        // Compute overall score
        let atpScore = 0;
        let oppScore = 0;
        if (games.length > 0) {
            games.forEach(g => {
                atpScore += g.scoreAtp || 0;
                oppScore += g.scoreOpp || 0;
            });
        }

        // Compile overall opponent summary for backward compatibility
        const opponentsList = [...new Set(games.map(g => g.opponent).filter(Boolean))];
        const opponentSummary = opponentsList.join(', ') || 'TBD';

        const icon = document.getElementById('match-log-icon-data')?.value || '';

        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];

        if (this.editingMatchLogId) {
            const index = logs.findIndex(l => l.id === this.editingMatchLogId);
            if (index > -1) {
                logs[index] = {
                    ...logs[index],
                    title,
                    opponent: opponentSummary,
                    date,
                    endDate,
                    atpScore,
                    oppScore,
                    notes,
                    ageCategory: document.getElementById('match-log-age-category')?.value || 'U18',
                    format: document.getElementById('match-log-format')?.value || '5x5',
                    mode: this.matchLogMode || 'team',
                    athleteId,
                    attendedAthleteIds,
                    attendedStaffIds,
                    games,
                    icon
                };
                window.WellnessModule.showToast('Match log updated successfully!', 'success');
            } else {
                window.WellnessModule.showToast('Error editing: Match log not found.', 'danger');
                return;
            }
        } else {
            const matchLog = {
                id: 'match_log_' + Date.now(),
                title,
                opponent: opponentSummary,
                date,
                endDate,
                atpScore,
                oppScore,
                notes,
                ageCategory: document.getElementById('match-log-age-category')?.value || 'U18',
                format: document.getElementById('match-log-format')?.value || '5x5',
                mode: this.matchLogMode || 'team',
                athleteId,
                attendedAthleteIds,
                attendedStaffIds,
                games,
                icon
            };
            logs.push(matchLog);
            window.WellnessModule.showToast('Match log saved successfully!', 'success');
        }

        localStorage.setItem('atp_match_logs', JSON.stringify(logs));
        this.initMatchLogView();
    },

    editMatchLog(id) {
        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const log = logs.find(l => l.id === id);
        if (!log) {
            window.WellnessModule.showToast('Match log not found.', 'danger');
            return;
        }

        this.editingMatchLogId = id;

        if (this.saveMatchLogBtn) {
            this.saveMatchLogBtn.innerHTML = '<i class="fas fa-save"></i> Update Match Log';
        }

        if (this.matchLogTitle) this.matchLogTitle.value = log.title || '';
        if (this.matchLogOpponent) this.matchLogOpponent.value = log.opponent || '';
        if (this.matchLogDate) this.matchLogDate.value = log.date || '';
        if (this.matchLogEndDate) this.matchLogEndDate.value = log.endDate || '';
        if (this.matchLogNotes) this.matchLogNotes.value = log.notes || '';

        const ageSelect = document.getElementById('match-log-age-category');
        if (ageSelect) ageSelect.value = log.ageCategory || 'U18';

        const formatSelect = document.getElementById('match-log-format');
        if (formatSelect) formatSelect.value = log.format || '5x5';

        const iconPreview = document.getElementById('match-log-icon-preview');
        const iconData = document.getElementById('match-log-icon-data');
        if (log.icon) {
            if (iconPreview) iconPreview.innerHTML = `<img src="${log.icon}" style="width: 100%; height: 100%; object-fit: cover;">`;
            if (iconData) iconData.value = log.icon;
        } else {
            if (iconPreview) iconPreview.innerHTML = '<i class="fas fa-trophy" style="color: var(--text-muted); font-size: 0.9rem;"></i>';
            if (iconData) iconData.value = '';
        }

        this.setMatchLogMode(log.mode || 'team');

        if (log.mode === 'individual') {
            const select = document.getElementById('match-log-athlete-select');
            if (select) select.value = log.athleteId || '';
        } else {
            const checkedBoxes = document.querySelectorAll('.match-attendance-checkbox');
            checkedBoxes.forEach(cb => {
                cb.checked = (log.attendedAthleteIds || []).includes(cb.value);
            });
            const filter = document.getElementById('match-log-team-filter');
            if (filter) {
                filter.value = 'all';
                this.filterMatchLogAttendance();
            }
        }

        const staffBoxes = document.querySelectorAll('.match-staff-checkbox');
        staffBoxes.forEach(cb => {
            cb.checked = (log.attendedStaffIds || []).includes(cb.value);
        });

        const gamesList = document.getElementById('match-log-games-list');
        if (gamesList) {
            gamesList.innerHTML = '';
            if (log.games && log.games.length > 0) {
                log.games.forEach(game => {
                    if (!game.opponent && log.opponent) {
                        game.opponent = log.opponent;
                    }
                    this.addNewGameRow(game);
                });
            }
        }

        if (this.matchLogTitle) {
            this.matchLogTitle.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    },

    renderMatchHistoryTable() {
        const histBody = document.getElementById('match-log-history-body');
        if (!histBody) return;
        histBody.innerHTML = '';
        // Also keep backward compat ref if App set it
        if (this.matchLogHistoryBody && this.matchLogHistoryBody !== histBody) this.matchLogHistoryBody = histBody;

        // Feature 5: Synchronize natively with Store.getMatches() for comprehensive history
        let logs = window.Store.getMatches ? window.Store.getMatches() : [];
        const oldLogs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        // Merge old match logs if they don't exist in season matches
        oldLogs.forEach(ol => {
            if (!logs.some(l => l.id === ol.id || l.id === `sp_${ol.id}`)) {
                logs.push(ol);
            }
        });
        
        if (logs.length === 0) {
            histBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No match logs found.</td></tr>';
            this.renderTournamentAnalytics();
            return;
        }

        // Search & Team Filtering
        const searchQuery = (document.getElementById('match-log-search-input')?.value || '').toLowerCase().trim();
        const teamFilter = document.getElementById('match-log-history-team-filter')?.value || 'all';

        if (teamFilter !== 'all') {
            const athletes = window.Store.getAthletesOnly();
            const teamAthletes = athletes.filter(a => a.team === teamFilter).map(a => a.id);
            logs = logs.filter(l => (l.attendedAthleteIds || []).some(id => teamAthletes.includes(id)));
        }

        if (searchQuery) {
            logs = logs.filter(l => 
                (l.title && l.title.toLowerCase().includes(searchQuery)) ||
                (l.opponent && l.opponent.toLowerCase().includes(searchQuery)) ||
                (l.notes && l.notes.toLowerCase().includes(searchQuery))
            );
        }

        logs.sort((a, b) => new Date(b.date) - new Date(a.date));
        const athletes = window.Store.getAthletes();
        const staffList = window.Store.getStaffOnly();

        logs.forEach(log => {
            const names = (log.attendedAthleteIds || []).map(id => {
                const a = athletes.find(ath => ath.id === id);
                return a ? this.getAthleteDisplayName(a) : id;
            }).join(', ');

            const staffNames = (log.attendedStaffIds || []).map(id => {
                const s = staffList.find(st => st.id === id);
                return s ? (s.fullName || s.name) : id;
            }).join(', ') || 'None';

            let resultBadge = '';
            let scoreText = 'PENDING';

            if (!log.games || log.games.length === 0) {
                resultBadge = '<span class="match-result-draw" style="background: rgba(255,255,255,0.05); color: var(--text-muted); border-color: rgba(255,255,255,0.1);">PENDING</span>';
                scoreText = '<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal;">PENDING</span>';
            } else {
                let atpSum = 0;
                let oppSum = 0;
                log.games.forEach(g => {
                    atpSum += parseInt(g.scoreAtp) || 0;
                    oppSum += parseInt(g.scoreOpp) || 0;
                });
                scoreText = `${atpSum} - ${oppSum}`;

                if (atpSum > oppSum) {
                    resultBadge = '<span class="match-result-win">WIN</span>';
                } else if (atpSum < oppSum) {
                    resultBadge = '<span class="match-result-loss">LOSS</span>';
                } else {
                    resultBadge = '<span class="match-result-draw">DRAW</span>';
                }
            }

            const dateStr = log.endDate && log.endDate !== log.date 
                ? `${log.date} to ${log.endDate}` 
                : log.date;

            const ageBadge = `<span style="background: rgba(255,255,255,0.08); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.1); font-weight: 500;">${log.ageCategory || 'U18'}</span>`;
            const formatBadge = `<span style="background: rgba(234,58,42,0.1); color: var(--accent-orange); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(234,58,42,0.2); font-weight: 500;">${log.format || '5x5'}</span>`;
            
            let modeBadge = '';
            if (log.mode === 'individual') {
                const targetAth = athletes.find(a => a.id === log.athleteId);
                const athName = targetAth ? this.getAthleteDisplayName(targetAth) : 'Unknown';
                modeBadge = `<span style="background: rgba(0, 150, 255, 0.1); color: var(--accent-blue); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(0, 150, 255, 0.2); font-weight: 500;">👤 Indiv: ${athName}</span>`;
            } else {
                modeBadge = `<span style="background: rgba(255, 255, 255, 0.04); color: var(--text-muted); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.08); font-weight: 500;">👥 Team</span>`;
            }

            let gamesHtml = '';
            if (log.games && log.games.length > 0) {
                gamesHtml += `
                <div style="margin-top: 10px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 8px;">
                    <div style="font-weight: 600; font-size: 0.75rem; color: var(--text-primary); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px;">Games & Rounds Details:</div>
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                `;
                log.games.forEach((game, idx) => {
                    let playerStatsSummaryHtml = '';
                    if (game.playerStats && game.playerStats.length > 0) {
                        playerStatsSummaryHtml = `
                            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.05); font-size: 0.7rem; color: var(--text-muted);">
                                <strong>Top Stats:</strong> ${game.playerStats.map(ps => {
                                    const ath = athletes.find(a => a.id === ps.athleteId);
                                    const name = ath ? (ath.nickname || ath.fullName) : ps.athleteId;
                                    return `${name} (${ps.pts}p ${ps.reb}r ${ps.ast}a EFF:${ps.eff})`;
                                }).slice(0, 3).join(' • ')}
                            </div>
                        `;
                    }

                    gamesHtml += `
                        <div style="background: rgba(255, 255, 255, 0.01); border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 6px; padding: 8px; display: flex; gap: 10px; align-items: flex-start;">
                            ${game.imageData ? `
                            <a href="${game.imageData}" target="_blank" title="View full size photo" style="flex-shrink: 0;">
                                <img src="${game.imageData}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15);">
                            </a>
                            ` : ''}
                            <div style="flex-grow: 1; font-size: 0.75rem; min-width: 0;">
                                <div style="display: flex; justify-content: space-between; align-items: center; font-weight: bold; color: var(--accent-blue);">
                                    <span>
                                        Game #${idx + 1}
                                        <span style="font-size: 0.68rem; background: rgba(0,150,255,0.15); color: var(--accent-blue); padding: 1px 5px; border-radius: 3px; margin-left: 4px;">${game.stage || 'Group Stage'}</span>
                                        ${game.opponent ? ` vs ${game.opponent}` : ''}
                                    </span>
                                    <span style="font-family: monospace;" class="font-mono">${game.scoreAtp} - ${game.scoreOpp}</span>
                                </div>
                                ${game.stats ? `<div style="color: var(--text-secondary); margin-top: 2px;"><strong>Stats:</strong> ${game.stats}</div>` : ''}
                                ${game.notes ? `<div style="color: var(--text-muted); font-style: italic; margin-top: 2px;"><strong>Notes:</strong> ${game.notes}</div>` : ''}
                                ${playerStatsSummaryHtml}
                            </div>
                        </div>
                    `;
                });
                gamesHtml += `
                    </div>
                </div>
                `;
            }

            let iconHtml = `
                <div style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.02); overflow: hidden; flex-shrink: 0;">
                    <i class="fas fa-trophy" style="color: var(--text-muted); font-size: 0.8rem;"></i>
                </div>
            `;
            if (log.icon) {
                iconHtml = `
                    <div style="width: 32px; height: 32px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.02); overflow: hidden; flex-shrink: 0;">
                        <img src="${log.icon}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                `;
            }

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="padding: 12px 6px;">
                    <div style="display: flex; gap: 10px; align-items: flex-start;">
                        ${iconHtml}
                        <div style="flex-grow: 1; min-width: 0;">
                            <div style="font-weight: bold; color: var(--text-primary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                <span>${log.title}</span>
                                ${ageBadge}
                                ${formatBadge}
                                ${modeBadge}
                            </div>
                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px;">
                                vs <span style="color: var(--accent-orange); font-weight: 500;">${log.opponent}</span> • ${dateStr}
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; line-height: 1.2;">
                                Players: <span style="color: var(--text-secondary);">${names}</span>
                            </div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px; line-height: 1.2;">
                                Staff: <span style="color: var(--text-secondary);">${staffNames}</span>
                            </div>
                            ${log.notes ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 6px; font-style: italic; max-width: 300px; white-space: normal;">Summary Notes: ${log.notes}</div>` : ''}
                            ${gamesHtml}
                        </div>
                    </div>
                </td>
                <td style="padding: 12px 6px; text-align: center; font-weight: bold; font-family: monospace; font-size: 1rem; color: var(--accent-blue);">
                    ${scoreText}
                </td>
                <td style="padding: 12px 6px; text-align: center;">
                    ${resultBadge}
                </td>
                <td style="padding: 12px 6px; text-align: right; white-space: nowrap;">
                    <button class="btn btn-primary btn-sm" onclick="window.App.openDetailedMatchReport('${log.id}')" style="padding: 4px 10px; margin-right: 4px; font-weight: bold; background: var(--accent-blue); color: #000; border: none;" title="View Detailed Match Report & FIBA Box Score">
                        <i class="fas fa-file-invoice"></i> Report
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="window.App.editMatchLog('${log.id}')" style="padding: 4px 8px; margin-right: 4px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.App.deleteMatchLog('${log.id}')" style="padding: 4px 8px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            histBody.appendChild(tr);
        });
    },
    deleteMatchLog(id) {
        if (!this.checkAdminPermission()) return;
        if (confirm('Are you sure you want to delete this match log?')) {
            let logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
            logs = logs.filter(log => log.id !== id);
            localStorage.setItem('atp_match_logs', JSON.stringify(logs));
            window.WellnessModule.showToast('Match log deleted.', 'info');
            this.renderMatchHistoryTable();
        }
    },

    renderTournamentAnalytics() {
        const selectEl = document.getElementById('tournament-analytics-select');
        const selectedTourn = selectEl ? selectEl.value : 'all';

        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const filteredLogs = selectedTourn === 'all' 
            ? logs 
            : logs.filter(l => l.title === selectedTourn);

        let wins = 0;
        let losses = 0;
        let draws = 0;
        let totalPtsFor = 0;
        let totalPtsOpp = 0;
        let totalGamesCount = 0;

        const playerTotals = {}; // athleteId -> { pts, reb, ast, stl, blk, eff, gamesPlayed }

        filteredLogs.forEach(log => {
            if (log.games && log.games.length > 0) {
                log.games.forEach(g => {
                    totalGamesCount++;
                    const atp = parseInt(g.scoreAtp) || 0;
                    const opp = parseInt(g.scoreOpp) || 0;
                    totalPtsFor += atp;
                    totalPtsOpp += opp;

                    if (atp > opp) wins++;
                    else if (atp < opp) losses++;
                    else draws++;

                    if (g.playerStats) {
                        g.playerStats.forEach(ps => {
                            if (!playerTotals[ps.athleteId]) {
                                playerTotals[ps.athleteId] = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, eff: 0, gamesPlayed: 0 };
                            }
                            playerTotals[ps.athleteId].pts += ps.pts || 0;
                            playerTotals[ps.athleteId].reb += ps.reb || 0;
                            playerTotals[ps.athleteId].ast += ps.ast || 0;
                            playerTotals[ps.athleteId].stl += ps.stl || 0;
                            playerTotals[ps.athleteId].blk += ps.blk || 0;
                            playerTotals[ps.athleteId].eff += ps.eff || 0;
                            playerTotals[ps.athleteId].gamesPlayed += 1;
                        });
                    }
                });
            }
        });

        const recordEl = document.getElementById('tourn-record-val');
        const diffEl = document.getElementById('tourn-diff-val');
        const ppgEl = document.getElementById('tourn-ppg-val');

        if (recordEl) recordEl.textContent = `${wins}W - ${losses}L${draws > 0 ? ` - ${draws}D` : ''}`;
        
        const diff = totalPtsFor - totalPtsOpp;
        if (diffEl) {
            diffEl.textContent = (diff >= 0 ? `+${diff}` : `${diff}`);
            diffEl.style.color = diff >= 0 ? 'var(--accent-blue)' : 'var(--accent-red)';
        }

        const avgPtsFor = totalGamesCount > 0 ? (totalPtsFor / totalGamesCount).toFixed(1) : '0.0';
        const avgPtsOpp = totalGamesCount > 0 ? (totalPtsOpp / totalGamesCount).toFixed(1) : '0.0';
        if (ppgEl) ppgEl.textContent = `${avgPtsFor} / ${avgPtsOpp}`;

        // Render Leaders
        const leadersGrid = document.getElementById('tournament-leaders-grid');
        if (!leadersGrid) return;
        leadersGrid.innerHTML = '';

        const athletes = window.Store.getAthletes();
        const playerList = Object.keys(playerTotals).map(id => {
            const ath = athletes.find(a => a.id === id);
            const name = ath ? this.getAthleteDisplayName(ath) : id;
            const stats = playerTotals[id];
            const ppg = stats.gamesPlayed > 0 ? (stats.pts / stats.gamesPlayed).toFixed(1) : '0';
            const rpg = stats.gamesPlayed > 0 ? (stats.reb / stats.gamesPlayed).toFixed(1) : '0';
            const apg = stats.gamesPlayed > 0 ? (stats.ast / stats.gamesPlayed).toFixed(1) : '0';
            const effAvg = stats.gamesPlayed > 0 ? (stats.eff / stats.gamesPlayed).toFixed(1) : '0';
            return { id, name, stats, ppg: parseFloat(ppg), rpg: parseFloat(rpg), apg: parseFloat(apg), effAvg: parseFloat(effAvg) };
        });

        if (playerList.length === 0) {
            leadersGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem; grid-column: 1 / -1;">No box score stats logged yet.</div>';
            return;
        }

        const topScorer = [...playerList].sort((a, b) => b.ppg - a.ppg)[0];
        const topRebounder = [...playerList].sort((a, b) => b.rpg - a.rpg)[0];
        const topPlaymaker = [...playerList].sort((a, b) => b.apg - a.apg)[0];
        const topEff = [...playerList].sort((a, b) => b.effAvg - a.effAvg)[0];

        const leaderCards = [
            { title: 'Top Scorer', icon: 'fa-fire', name: topScorer?.name, stat: `${topScorer?.ppg} PPG` },
            { title: 'Top Rebounder', icon: 'fa-hands', name: topRebounder?.name, stat: `${topRebounder?.rpg} RPG` },
            { title: 'Top Playmaker', icon: 'fa-magic', name: topPlaymaker?.name, stat: `${topPlaymaker?.apg} APG` },
            { title: 'EFF Leader', icon: 'fa-star', name: topEff?.name, stat: `+${topEff?.effAvg} EFF` }
        ];

        leaderCards.forEach(card => {
            const div = document.createElement('div');
            div.style = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 6px; padding: 8px; display: flex; flex-direction: column; gap: 2px;';
            div.innerHTML = `
                <div style="font-size: 0.68rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px;">
                    <i class="fas ${card.icon}" style="color: #F59E0B;"></i> ${card.title}
                </div>
                <div style="font-size: 0.8rem; font-weight: bold; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${card.name || 'N/A'}</div>
                <div style="font-size: 0.72rem; color: var(--accent-orange); font-family: monospace; font-weight: 600;">${card.stat || '-'}</div>
            `;
            leadersGrid.appendChild(div);
        });
    },

    exportMatchLogsToCSV() {
        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        if (logs.length === 0) {
            window.WellnessModule.showToast('No match logs to export.', 'danger');
            return;
        }

        const athletes = window.Store.getAthletes();
        let csvContent = 'data:text/csv;charset=utf-8,';
        csvContent += 'Tournament,Date,End Date,Format,Age Category,Mode,Game Stage,Opponent,ATP Score,Opponent Score,Player Name,MIN,PTS,REB,AST,STL,BLK,TO,PF,FGM,FGA,PlusMinus,FIBA_EFF\n';

        logs.forEach(log => {
            if (log.games && log.games.length > 0) {
                log.games.forEach(g => {
                    if (g.playerStats && g.playerStats.length > 0) {
                        g.playerStats.forEach(ps => {
                            const ath = athletes.find(a => a.id === ps.athleteId);
                            const pName = ath ? (ath.fullName || ath.nickname) : ps.athleteId;
                            csvContent += `"${log.title || ''}","${log.date || ''}","${log.endDate || ''}","${log.format || '5x5'}","${log.ageCategory || 'U18'}","${log.mode || 'team'}","${g.stage || 'Group Stage'}","${g.opponent || ''}",${g.scoreAtp || 0},${g.scoreOpp || 0},"${pName}",${ps.min || 0},${ps.pts || 0},${ps.reb || 0},${ps.ast || 0},${ps.stl || 0},${ps.blk || 0},${ps.to || 0},${ps.pf || 0},${ps.fgm || 0},${ps.fga || 0},${ps.plusMinus || 0},${ps.eff || 0}\n`;
                        });
                    } else {
                        csvContent += `"${log.title || ''}","${log.date || ''}","${log.endDate || ''}","${log.format || '5x5'}","${log.ageCategory || 'U18'}","${log.mode || 'team'}","${g.stage || 'Group Stage'}","${g.opponent || ''}",${g.scoreAtp || 0},${g.scoreOpp || 0},"N/A",0,0,0,0,0,0,0,0,0,0,0,0\n`;
                    }
                });
            }
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `ATP_Match_Logs_Export_${window.Store.getLocalDateString()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        window.WellnessModule.showToast('Match logs exported to CSV successfully!', 'success');
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  LIVE STAT TRACKER (Delegates to window.LiveTrackerModule)
    // ═══════════════════════════════════════════════════════════════════════
    get liveTracker() { return window.LiveTrackerModule ? window.LiveTrackerModule.liveTracker : null; },
    set liveTracker(val) { if (window.LiveTrackerModule) window.LiveTrackerModule.liveTracker = val; },

openDetailedMatchReport(matchId) {
    const modal = document.getElementById('detailed-match-report-modal');
    const container = document.getElementById('detailed-match-report-content');
    if (!modal || !container) return;

    let matchData = null;

    const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
    const seasonMatches = window.Store.getMatches ? window.Store.getMatches() : [];
    
    const rawId = matchId ? matchId.replace(/^sp_/, '') : '';
    const spId = 'sp_' + rawId;

    // Priority 1: Find in saved Match Logs (atp_match_logs)
    const logMatch = logs.find(l => l.id === matchId || l.id === rawId || l.id === spId);

    if (logMatch) {
        let atpTotal = logMatch.atpScore || 0;
        let oppTotal = logMatch.oppScore || 0;
        let statsObj = {};
        let oppStatsObj = logMatch.oppStats || { pts: oppTotal, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };

        if (logMatch.games && logMatch.games.length > 0) {
            let aggregatedOppStats = {};
            logMatch.games.forEach(g => {
                if (g.oppStats) {
                    Object.keys(g.oppStats).forEach(k => {
                        aggregatedOppStats[k] = (aggregatedOppStats[k] || 0) + (g.oppStats[k] || 0);
                    });
                }
                // Handle both Array format (saved by liveTracker) and Object format (keyed by athleteId)
                const psEntries = Array.isArray(g.playerStats)
                    ? g.playerStats
                    : (g.playerStats && typeof g.playerStats === 'object' ? Object.entries(g.playerStats).map(([id, s]) => ({ athleteId: id, ...s })) : []);
                psEntries.forEach(ps => {
                    if (ps.athleteId) {
                        if (!statsObj[ps.athleteId]) {
                            statsObj[ps.athleteId] = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, min: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
                        }
                        const target = statsObj[ps.athleteId];
                        target.pts  += (ps.pts  || 0);
                        target.reb  += (ps.reb  || 0);
                        target.oreb += (ps.oreb || 0);
                        target.dreb += (ps.dreb || 0);
                        target.ast  += (ps.ast  || 0);
                        target.stl  += (ps.stl  || 0);
                        target.blk  += (ps.blk  || 0);
                        target.to   += (ps.to   || 0);
                        target.pf   += (ps.pf   || 0);
                        target.min  += (ps.min  || 0);
                        target.fgm  += (ps.fgm  || 0);
                        target.fga  += (ps.fga  || 0);
                        target.fg2m += (ps.fg2m || 0);
                        target.fg2a += (ps.fg2a || 0);
                        target.fg3m += (ps.fg3m || 0);
                        target.fg3a += (ps.fg3a || 0);
                        target.ftm  += (ps.ftm  || 0);
                        target.fta  += (ps.fta  || 0);
                        target.pm   += (ps.pm !== undefined ? ps.pm : (ps.plusMinus || 0));
                        target.eff  += (ps.eff  || 0);
                    }
                });
            });

            if (Object.keys(aggregatedOppStats).length > 0) {
                oppStatsObj = Object.assign({}, oppStatsObj, aggregatedOppStats);
            }
        }


        // Fallback to active liveTracker ONLY IF statsObj is empty AND liveTracker has actual logged stats
        if (Object.keys(statsObj).length === 0 && this.liveTracker && this.liveTracker.playerStats) {
            const hasData = Object.values(this.liveTracker.playerStats).some(s => s && (s.pts > 0 || s.reb > 0 || s.ast > 0 || s.stl > 0 || s.blk > 0 || s.to > 0));
            if (hasData) {
                statsObj = Object.assign({}, statsObj, this.liveTracker.playerStats);
                if (this.liveTracker.oppStats) {
                    oppStatsObj = Object.assign({}, oppStatsObj, this.liveTracker.oppStats);
                }
            }
        }

        matchData = {
            title: logMatch.title,
            teamName: logMatch.teamName || 'MPS',
            oppName: logMatch.opponent || 'Opponent',
            date: logMatch.date,
            scoreTeam: atpTotal,
            scoreOpp: oppTotal,
            quarterScores: logMatch.quarterScores || {},
            our_pts_from_to: logMatch.our_pts_from_to || 0,
            opp_pts_from_to: logMatch.opp_pts_from_to || 0,
            playerStats: statsObj,
            oppStats: oppStatsObj,
            pbpEvents: logMatch.pbpEvents || []
        };
    }

    // Priority 2: Find in Season Planner matches if not found in Match Logs or if matchData stats are empty
    if (!matchData || Object.keys(matchData.playerStats || {}).length === 0) {
        const spMatch = seasonMatches.find(m => m.id === rawId || m.id === matchId || m.id === spId);
        if (spMatch) {
            let spStatsObj = {};
            let spOppStats = (spMatch.lastGameStats && spMatch.lastGameStats.oppStats) ? spMatch.lastGameStats.oppStats : (spMatch.oppStats || {});

            if (spMatch.lastGameStats && Array.isArray(spMatch.lastGameStats.playerStats)) {
                spMatch.lastGameStats.playerStats.forEach(ps => {
                    if (ps.athleteId) {
                        spStatsObj[ps.athleteId] = ps;
                    }
                });
            } else if (spMatch.lastGameStats && spMatch.lastGameStats.playerStats && typeof spMatch.lastGameStats.playerStats === 'object') {
                spStatsObj = spMatch.lastGameStats.playerStats;
            }

            // Fallback to active liveTracker ONLY IF spStatsObj is empty AND liveTracker has actual logged stats
            if (Object.keys(spStatsObj).length === 0 && this.liveTracker && this.liveTracker.playerStats) {
                const hasData = Object.values(this.liveTracker.playerStats).some(s => s && (s.pts > 0 || s.reb > 0 || s.ast > 0 || s.stl > 0 || s.blk > 0 || s.to > 0));
                if (hasData) {
                    spStatsObj = Object.assign({}, spStatsObj, this.liveTracker.playerStats);
                    if (this.liveTracker.oppStats) {
                        spOppStats = Object.assign({}, spOppStats, this.liveTracker.oppStats);
                    }
                }
            }

            matchData = {
                title: spMatch.name || 'Fixture Match',
                teamName: 'MPS',
                oppName: spMatch.opponent || spMatch.venue || 'Opponent',
                date: spMatch.date || window.Store.getLocalDateString(),
                scoreTeam: spMatch.atpScore || 0,
                scoreOpp: spMatch.oppScore || 0,
                quarterScores: (spMatch.lastGameStats && spMatch.lastGameStats.quarterScores) ? spMatch.lastGameStats.quarterScores : {},
                playerStats: spStatsObj,
                oppStats: spOppStats,
                pbpEvents: []
            };
        }
    }

    // Priority 3: Active Live Tracker Session (fallback ONLY if matchData is still null or has no playerStats)
    if ((!matchData || Object.keys(matchData.playerStats || {}).length === 0) && this.liveTracker) {
        matchData = {
            title: `${this.liveTracker.teamName || 'MPS'} vs ${this.liveTracker.oppName || 'Opponent'}`,
            teamName: this.liveTracker.teamName || 'MPS',
            oppName: this.liveTracker.oppName || 'Opponent',
            date: window.Store.getLocalDateString(),
            scoreTeam: this.liveTracker.scoreTeam || 0,
            scoreOpp: this.liveTracker.scoreOpp || 0,
            quarterScores: this.liveTracker.quarterScores || {},
            playerStats: this.liveTracker.playerStats || {},
            oppStats: this.liveTracker.oppStats || {},
            pbpEvents: this.liveTracker.pbpEvents || []
        };
    }

    if (!matchData) {
        window.WellnessModule.showToast('Match report data not found.', 'danger');
        return;
    }

    const athletes = window.Store.getAthletesOnly();

    // Compute Team Totals
    let teamTotals = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, eff: 0 };
    Object.keys(matchData.playerStats || {}).forEach(id => {
        const s = matchData.playerStats[id];
        teamTotals.pts += (s.pts || 0);
        teamTotals.reb += (s.reb || 0);
        teamTotals.oreb += (s.oreb || 0);
        teamTotals.dreb += (s.dreb || 0);
        teamTotals.ast += (s.ast || 0);
        teamTotals.stl += (s.stl || 0);
        teamTotals.blk += (s.blk || 0);
        teamTotals.to += (s.to || 0);
        teamTotals.pf += (s.pf || 0);
        teamTotals.fgm += (s.fgm || 0);
        teamTotals.fga += (s.fga || 0);
        teamTotals.fg3m += (s.fg3m || 0);
        teamTotals.fg3a += (s.fg3a || 0);
        teamTotals.ftm += (s.ftm || 0);
        teamTotals.fta += (s.fta || 0);
        teamTotals.eff += (s.eff || 0);
    });

    const opp = matchData.oppStats || {};
    const oppPts = matchData.scoreOpp !== undefined ? matchData.scoreOpp : (opp.pts || 0);

    const oppFgPctStr = opp.fga > 0 ? ((opp.fgm / opp.fga) * 100).toFixed(1) + '%' : '0.0%';
    const opp3PctStr = opp.fg3a > 0 ? ((opp.fg3m / opp.fg3a) * 100).toFixed(1) + '%' : '0.0%';
    const oppFtPctStr = opp.fta > 0 ? ((opp.ftm / opp.fta) * 100).toFixed(1) + '%' : '0.0%';

    const teamFgPctStr = teamTotals.fga > 0 ? ((teamTotals.fgm / teamTotals.fga) * 100).toFixed(1) + '%' : '0.0%';
    const team3PctStr = teamTotals.fg3a > 0 ? ((teamTotals.fg3m / teamTotals.fg3a) * 100).toFixed(1) + '%' : '0.0%';
    const teamFtPctStr = teamTotals.fta > 0 ? ((teamTotals.ftm / teamTotals.fta) * 100).toFixed(1) + '%' : '0.0%';

    // PTS FROM TO: generic backend keys our_pts_from_to / opp_pts_from_to
    const teamPtsFromTO = matchData.our_pts_from_to || matchData.ourPtsFromTO || 0;
    const oppPtsFromTO  = matchData.opp_pts_from_to  || matchData.oppPtsFromTO  || 0;

    // Quarter-by-quarter data
    const qScores = matchData.quarterScores || {};
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const qRowTeam = quarters.map(q => `<td style="text-align:center; padding:5px; font-size:0.8rem;">${(qScores[q] && qScores[q].team !== undefined) ? qScores[q].team : '-'}</td>`).join('');
    const qRowOpp  = quarters.map(q => `<td style="text-align:center; padding:5px; font-size:0.8rem;">${(qScores[q] && qScores[q].opp  !== undefined) ? qScores[q].opp  : '-'}</td>`).join('');
    const quarterMatrixHtml = `
        <div style="background: rgba(255,255,255,0.02); border: 1.5px solid var(--border-color); border-radius: 10px; padding: 16px; margin-bottom: 24px;">
            <h4 style="color: var(--accent-blue); margin-bottom: 12px; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-th"></i> QUARTER-BY-QUARTER SCORE BREAKDOWN
            </h4>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.82rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.03);">
                            <th style="text-align:left; padding:8px; color:var(--text-muted); font-size:0.72rem;">TEAM</th>
                            <th style="padding:8px; color:var(--accent-blue); font-weight:bold;">TOTAL</th>
                            <th style="padding:8px; color:var(--text-secondary);">Q1</th>
                            <th style="padding:8px; color:var(--text-secondary);">Q2</th>
                            <th style="padding:8px; color:var(--text-secondary);">Q3</th>
                            <th style="padding:8px; color:var(--text-secondary);">Q4</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.06);">
                            <td style="text-align:left; padding:8px; font-weight:bold; color:var(--accent-blue);">${matchData.teamName || 'OUR TEAM'}</td>
                            <td style="padding:8px; font-weight:900; font-size:1.1rem; color:${matchData.scoreTeam >= matchData.scoreOpp ? '#10B981' : 'inherit'};">${matchData.scoreTeam}</td>
                            ${qRowTeam}
                        </tr>
                        <tr>
                            <td style="text-align:left; padding:8px; font-weight:bold; color:var(--accent-orange);">${matchData.oppName || 'OPPONENT'}</td>
                            <td style="padding:8px; font-weight:900; font-size:1.1rem; color:${matchData.scoreOpp > matchData.scoreTeam ? '#10B981' : 'var(--accent-orange)'};">${matchData.scoreOpp}</td>
                            ${qRowOpp}
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Build Team Comparison HTML Table
    const teamComparisonHtml = `
        <div style="background: rgba(255,255,255,0.02); border: 1.5px solid var(--border-color); border-radius: 10px; padding: 18px; margin-bottom: 24px;">
            <h4 style="color: var(--accent-blue); margin-bottom: 14px; font-size: 1rem; display: flex; align-items: center; gap: 8px;">
                <i class="fas fa-balance-scale"></i> TEAM STATS COMPARISON
            </h4>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; text-align: center; font-size: 0.82rem;">
                    <thead>
                        <tr style="border-bottom: 2px solid rgba(255,255,255,0.1); font-weight: bold; background: rgba(255,255,255,0.03);">
                            <th style="width: 35%; text-align: right; color: var(--accent-blue); padding: 8px; font-size: 0.95rem;">${matchData.teamName || 'MPS'}</th>
                            <th style="width: 30%; color: var(--text-muted); padding: 8px; text-transform: uppercase; font-size: 0.72rem;">TEAM METRIC</th>
                            <th style="width: 35%; text-align: left; color: var(--accent-orange); padding: 8px; font-size: 0.95rem;">${matchData.oppName || 'OPPONENT'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px; font-weight: bold; font-size: 1.1rem; color: ${matchData.scoreTeam >= matchData.scoreOpp ? '#10B981' : 'inherit'};">${matchData.scoreTeam}</td>
                            <td style="color: var(--text-muted); font-weight: 600;">FINAL POINTS</td>
                            <td style="text-align: left; padding: 6px; font-weight: bold; font-size: 1.1rem; color: ${matchData.scoreOpp > matchData.scoreTeam ? '#10B981' : 'var(--accent-orange)'};">${matchData.scoreOpp}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.fgm}/${teamTotals.fga} <strong style="color:var(--accent-blue);">(${teamFgPctStr})</strong></td>
                            <td style="color: var(--text-muted);">FIELD GOALS (FG%)</td>
                            <td style="text-align: left; padding: 6px;">${opp.fgm || 0}/${opp.fga || 0} <strong style="color:var(--accent-orange);">(${oppFgPctStr})</strong></td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.fg3m}/${teamTotals.fg3a} <strong style="color:var(--accent-blue);">(${team3PctStr})</strong></td>
                            <td style="color: var(--text-muted);">3-POINTERS (3P%)</td>
                            <td style="text-align: left; padding: 6px;">${opp.fg3m || 0}/${opp.fg3a || 0} <strong style="color:var(--accent-orange);">(${opp3PctStr})</strong></td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.ftm}/${teamTotals.fta} <strong style="color:var(--accent-blue);">(${teamFtPctStr})</strong></td>
                            <td style="color: var(--text-muted);">FREE THROWS (FT%)</td>
                            <td style="text-align: left; padding: 6px;">${opp.ftm || 0}/${opp.fta || 0} <strong style="color:var(--accent-orange);">(${oppFtPctStr})</strong></td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;"><strong>${teamTotals.reb}</strong> <small style="color:var(--text-muted);">(${teamTotals.oreb} OFF / ${teamTotals.dreb} DEF)</small></td>
                            <td style="color: var(--text-muted);">TOTAL REBOUNDS</td>
                            <td style="text-align: left; padding: 6px;"><strong>${opp.reb || 0}</strong> <small style="color:var(--text-muted);">(${opp.oreb || 0} OFF / ${opp.dreb || 0} DEF)</small></td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px; font-weight: bold; color: var(--accent-blue);">${teamTotals.ast}</td>
                            <td style="color: var(--text-muted);">ASSISTS (AST)</td>
                            <td style="text-align: left; padding: 6px; font-weight: bold; color: var(--accent-orange);">${opp.ast || 0}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.stl}</td>
                            <td style="color: var(--text-muted);">STEALS (STL)</td>
                            <td style="text-align: left; padding: 6px;">${opp.stl || 0}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.blk}</td>
                            <td style="color: var(--text-muted);">BLOCKS (BLK)</td>
                            <td style="text-align: left; padding: 6px;">${opp.blk || 0}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px; color: ${teamTotals.to > (opp.to || 0) ? '#EF4444' : 'inherit'};">${teamTotals.to}</td>
                            <td style="color: var(--text-muted);">TURNOVERS (TO)</td>
                            <td style="text-align: left; padding: 6px; color: ${(opp.to || 0) > teamTotals.to ? '#EF4444' : 'inherit'};">${opp.to || 0}</td>
                        </tr>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="text-align: right; padding: 6px;">${teamTotals.pf}</td>
                            <td style="color: var(--text-muted);">PERSONAL FOULS (PF)</td>
                            <td style="text-align: left; padding: 6px;">${opp.pf || 0}</td>
                        </tr>
                        <tr>
                            <td style="text-align: right; padding: 6px; font-weight: bold; color: #10B981;">${teamPtsFromTO}</td>
                            <td style="color: var(--text-muted); font-size:0.72rem;">PTS FROM TO<br><small style="color:var(--text-muted); font-size:0.68rem;">(Points off Turnovers)</small></td>
                            <td style="text-align: left; padding: 6px; font-weight: bold; color: #EF4444;">${oppPtsFromTO}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    // Find Game MVP (Highest EFF / PTS)
    let mvpAth = null;
    let maxEff = -999;
    Object.keys(matchData.playerStats || {}).forEach(id => {
        const s = matchData.playerStats[id];
        const ath = athletes.find(a => a.id === id);
        const effVal = (s.eff !== undefined) ? s.eff : (s.pts || 0);
        if (effVal > maxEff && ath) {
            maxEff = effVal;
            mvpAth = { ath, stats: s };
        }
    });

    // Team Score Result Badge
    const winLossBadge = matchData.scoreTeam > matchData.scoreOpp
        ? `<span style="background: #10B981; color: #000; font-weight: 900; padding: 4px 12px; border-radius: 6px; font-size: 0.9rem;">VICTORY (WIN)</span>`
        : (matchData.scoreTeam < matchData.scoreOpp ? `<span style="background: #EF4444; color: #FFF; font-weight: 900; padding: 4px 12px; border-radius: 6px; font-size: 0.9rem;">DEFEAT (LOSS)</span>` : `<span style="background: #F59E0B; color: #000; font-weight: 900; padding: 4px 12px; border-radius: 6px; font-size: 0.9rem;">DRAW</span>`);

    // Generate Player Box Score Rows HTML
    let boxScoreRowsHtml = '';
    Object.keys(matchData.playerStats || {}).forEach(id => {
        const s = matchData.playerStats[id];
        const ath = athletes.find(a => a.id === id);
        const name = ath ? this.getAthleteDisplayName(ath) : id;
        const jersey = (ath && ath.jerseyNumber) ? `#${ath.jerseyNumber}` : '';

        const fgPctStr = s.fga > 0 ? ((s.fgm / s.fga) * 100).toFixed(0) + '%' : '0%';
        const fg3PctStr = s.fg3a > 0 ? ((s.fg3m / s.fg3a) * 100).toFixed(0) + '%' : '0%';
        const ftPctStr = s.fta > 0 ? ((s.ftm / s.fta) * 100).toFixed(0) + '%' : '0%';

        boxScoreRowsHtml += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.78rem;">
                <td style="padding: 6px; font-weight: bold; color: var(--text-primary);">
                    ${name} <small style="color: var(--accent-blue);">${jersey}</small>
                </td>
                <td style="text-align: center; color: var(--accent-orange); font-weight: bold; font-size: 0.85rem;">${s.pts || 0}</td>
                <td style="text-align: center;">${s.fgm || 0}/${s.fga || 0} <small style="color:var(--text-muted);">(${fgPctStr})</small></td>
                <td style="text-align: center;">${s.fg3m || 0}/${s.fg3a || 0} <small style="color:var(--text-muted);">(${fg3PctStr})</small></td>
                <td style="text-align: center;">${s.ftm || 0}/${s.fta || 0} <small style="color:var(--text-muted);">(${ftPctStr})</small></td>
                <td style="text-align: center;">${s.reb || 0} <small style="color: var(--accent-blue);">(${s.oreb || 0}/${s.dreb || 0})</small></td>
                <td style="text-align: center;">${s.ast || 0}</td>
                <td style="text-align: center;">${s.stl || 0}</td>
                <td style="text-align: center;">${s.blk || 0}</td>
                <td style="text-align: center;">${s.to || 0}</td>
                <td style="text-align: center; color: ${(s.pf || 0) >= 5 ? '#EF4444' : 'inherit'};">${s.pf || 0}</td>
                <td style="text-align: center; color: ${(s.pm || 0) > 0 ? '#10B981' : ((s.pm || 0) < 0 ? '#EF4444' : 'inherit')};">${(s.pm || 0) > 0 ? '+' + s.pm : (s.pm || 0)}</td>
                <td style="text-align: center; color: var(--accent-blue); font-weight: bold;">${s.eff || 0}</td>
            </tr>
        `;
    });

    // Team Totals Row
    boxScoreRowsHtml += `
        <tr style="border-top: 2px solid var(--accent-blue); font-weight: bold; background: rgba(0, 150, 255, 0.08); font-size: 0.82rem;">
            <td style="padding: 8px; color: var(--accent-blue);">TEAM TOTALS</td>
            <td style="text-align: center; color: var(--accent-orange); font-size: 0.95rem;">${teamTotals.pts}</td>
            <td style="text-align: center;">${teamTotals.fgm}/${teamTotals.fga} (${teamFgPctStr})</td>
            <td style="text-align: center;">${teamTotals.fg3m}/${teamTotals.fg3a} (${team3PctStr})</td>
            <td style="text-align: center;">${teamTotals.ftm}/${teamTotals.fta} (${teamFtPctStr})</td>
            <td style="text-align: center;">${teamTotals.reb} (${teamTotals.oreb}/${teamTotals.dreb})</td>
            <td style="text-align: center;">${teamTotals.ast}</td>
            <td style="text-align: center;">${teamTotals.stl}</td>
            <td style="text-align: center;">${teamTotals.blk}</td>
            <td style="text-align: center;">${teamTotals.to}</td>
            <td style="text-align: center;">${teamTotals.pf}</td>
            <td style="text-align: center;">-</td>
            <td style="text-align: center; color: var(--accent-blue);">${teamTotals.eff}</td>
        </tr>
    `;

    // MVP Highlight HTML
    let mvpHtml = '';
    if (mvpAth) {
        const a = mvpAth.ath;
        const s = mvpAth.stats;
        const photoUrl = a.photo || a.photoData || null;
        let photoHtml = photoUrl 
            ? `<img src="${photoUrl}" style="width: 54px; height: 54px; border-radius: 50%; object-fit: cover; border: 2px solid #F59E0B;">`
            : `<div style="width: 54px; height: 54px; border-radius: 50%; background: rgba(245, 158, 11, 0.2); border: 2px solid #F59E0B; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; color: #F59E0B;">${a.nickname ? a.nickname[0] : (a.fullName ? a.fullName[0] : 'M')}</div>`;

        mvpHtml = `
            <div style="background: linear-gradient(135deg, rgba(245, 158, 11, 0.15), rgba(0, 0, 0, 0.4)); border: 1.5px solid #F59E0B; border-radius: 10px; padding: 14px; margin-bottom: 20px; display: flex; align-items: center; gap: 16px;">
                ${photoHtml}
                <div style="flex-grow: 1;">
                    <div style="font-size: 0.72rem; color: #F59E0B; font-weight: 900; letter-spacing: 1px; text-transform: uppercase;">⭐ GAME MVP & HIGHEST EFFICIENCY</div>
                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--text-primary); margin-top: 2px;">
                        ${this.getAthleteDisplayName(a)} <span style="font-size: 0.8rem; color: var(--accent-blue);">${a.jerseyNumber ? '#' + a.jerseyNumber : ''}</span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); margin-top: 4px; display: flex; gap: 12px; flex-wrap: wrap;">
                        <span><strong>${s.pts || 0}</strong> PTS</span>
                        <span><strong>${s.reb || 0}</strong> REB</span>
                        <span><strong>${s.ast || 0}</strong> AST</span>
                        <span><strong>${s.stl || 0}</strong> STL</span>
                        <span><strong>${s.blk || 0}</strong> BLK</span>
                        <span style="color: #F59E0B;">FIBA EFF: <strong>${s.eff || 0}</strong></span>
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <!-- Score Banner -->
        <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 10px; padding: 20px; text-align: center; margin-bottom: 20px;">
            <div style="font-size: 0.82rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">
                📅 ${matchData.date} • Match Report
            </div>
            <div style="display: flex; justify-content: center; align-items: center; gap: 24px; margin-bottom: 12px;">
                <div>
                    <div style="font-size: 1.4rem; font-weight: bold; color: var(--accent-blue);">${matchData.teamName}</div>
                    <div style="font-size: 3rem; font-weight: 900; font-family: monospace; color: var(--text-primary);">${matchData.scoreTeam}</div>
                </div>
                <div style="font-size: 1.5rem; font-weight: bold; color: var(--text-muted);">VS</div>
                <div>
                    <div style="font-size: 1.4rem; font-weight: bold; color: var(--accent-orange);">${matchData.oppName}</div>
                    <div style="font-size: 3rem; font-weight: 900; font-family: monospace; color: var(--accent-orange);">${matchData.scoreOpp}</div>
                </div>
            </div>
            <div>${winLossBadge}</div>
        </div>

        ${quarterMatrixHtml}

        ${teamComparisonHtml}

        ${mvpHtml}

        <!-- FIBA Box Score Table -->
        <div style="margin-bottom: 24px;">
            <h4 style="color: var(--accent-blue); margin-bottom: 10px; font-size: 1rem;"><i class="fas fa-list-alt"></i> FIBA Official Box Score Matrix</h4>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 750px;">
                    <thead>
                        <tr style="border-bottom: 2px solid var(--accent-blue); background: rgba(0, 150, 255, 0.1); font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase;">
                            <th style="text-align: left; padding: 8px;">PLAYER</th>
                            <th style="text-align: center; padding: 8px; color: var(--accent-orange);">PTS</th>
                            <th style="text-align: center; padding: 8px;">FG (M/A %)</th>
                            <th style="text-align: center; padding: 8px;">3PT (M/A %)</th>
                            <th style="text-align: center; padding: 8px;">FT (M/A %)</th>
                            <th style="text-align: center; padding: 8px;">REB (O/D)</th>
                            <th style="text-align: center; padding: 8px;">AST</th>
                            <th style="text-align: center; padding: 8px;">STL</th>
                            <th style="text-align: center; padding: 8px;">BLK</th>
                            <th style="text-align: center; padding: 8px;">TO</th>
                            <th style="text-align: center; padding: 8px;">PF</th>
                            <th style="text-align: center; padding: 8px;">+/-</th>
                            <th style="text-align: center; padding: 8px; color: var(--accent-blue);">EFF</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${boxScoreRowsHtml}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    modal.style.display = 'flex';
},

    printDetailedMatchReport() {
    const content = document.getElementById('detailed-match-report-content');
    if (!content) return;
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Detailed Match Report - ATP AMS</title>
                <style>
                    body { font-family: sans-serif; color: #000; background: #fff; padding: 20px; }
                    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                    th, td { border: 1px solid #ccc; padding: 6px; text-align: center; font-size: 12px; }
                    th { background: #f0f0f0; }
                    .text-left { text-align: left; }
                </style>
            </head>
            <body>
                ${content.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
}
};
