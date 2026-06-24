const AnalyticsModule = {
    volumeChart: null,
    readinessChart: null,
    analyticsIndivChart: null,
    analyticsTeamChart: null,

    init() {
        this.renderAll();
    },

    renderAll() {
        this.populateTestSelect();
        this.renderCharts();
        this.renderPRTable();
    },

    populateTestSelect() {
        if (!window.App || !window.App.analyticsTestSelect) return;
        const select = window.App.analyticsTestSelect;
        
        // Retain currently selected value if possible
        const currentSelected = select.value;
        const tests = window.Store.getTests();
        select.innerHTML = '';
        
        tests.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.id;
            opt.textContent = t.name;
            select.appendChild(opt);
        });
        
        if (currentSelected && tests.some(t => t.id === currentSelected)) {
            select.value = currentSelected;
        } else if (tests.length > 0) {
            select.value = tests[0].id;
        }
    },

    destroyCharts() {
        if (this.volumeChart) { this.volumeChart.destroy(); this.volumeChart = null; }
        if (this.readinessChart) { this.readinessChart.destroy(); this.readinessChart = null; }
        if (this.analyticsIndivChart) { this.analyticsIndivChart.destroy(); this.analyticsIndivChart = null; }
        if (this.analyticsTeamChart) { this.analyticsTeamChart.destroy(); this.analyticsTeamChart = null; }
    },

    calculateCNSFatigue(athleteId) {
        if (!athleteId) return { fatigued: false, reason: 'No athlete selected' };
        const logs = window.Store.getPerformanceLogs(athleteId);
        if (!logs || logs.length < 2) return { fatigued: false, reason: 'Insufficient baseline data' };
        
        const sortedLogs = [...logs].sort((a, b) => new Date(a.date) - new Date(b.date));
        const latestLog = sortedLogs[sortedLogs.length - 1];
        if (!latestLog) return { fatigued: false };

        const previousLogs = sortedLogs.slice(0, -1);
        
        let cmjFatigued = false;
        let rsiFatigued = false;
        
        // CMJ Baseline Calculation
        const prevCmjLogs = previousLogs.filter(l => l.cmj != null && l.cmj > 0);
        if (prevCmjLogs.length >= 1 && latestLog.cmj != null) {
            const cmjValues = prevCmjLogs.map(l => l.cmj);
            const cmjMean = cmjValues.reduce((sum, val) => sum + val, 0) / cmjValues.length;
            
            let cmjSD = 0;
            if (cmjValues.length >= 2) {
                const cmjVariance = cmjValues.reduce((sum, val) => sum + Math.pow(val - cmjMean, 2), 0) / cmjValues.length;
                cmjSD = Math.sqrt(cmjVariance);
            }
            
            if (latestLog.cmj < (cmjMean - 1.0 * cmjSD)) {
                cmjFatigued = true;
            }
        }
        
        // RSI Baseline Calculation
        const prevRsiLogs = previousLogs.filter(l => l.rsi != null && l.rsi > 0);
        if (prevRsiLogs.length >= 1 && latestLog.rsi != null) {
            const rsiValues = prevRsiLogs.map(l => l.rsi);
            const rsiMean = rsiValues.reduce((sum, val) => sum + val, 0) / rsiValues.length;
            
            let rsiSD = 0;
            if (rsiValues.length >= 2) {
                const rsiVariance = rsiValues.reduce((sum, val) => sum + Math.pow(val - rsiMean, 2), 0) / rsiValues.length;
                rsiSD = Math.sqrt(rsiVariance);
            }
            
            if (latestLog.rsi < (rsiMean - 1.0 * rsiSD)) {
                rsiFatigued = true;
            }
        }
        
        return {
            fatigued: cmjFatigued || rsiFatigued,
            cmjFatigued,
            rsiFatigued
        };
    },

    renderPRTable() {
        const prContainer = document.getElementById('pr-table-body');
        if (!prContainer) return;

        const activeAthleteId = window.App ? window.App.currentAthleteId : 'athlete_1';
        const prs = window.Store.getPersonalRecords(activeAthleteId);
        const prKeys = Object.keys(prs);

        if (prKeys.length === 0) {
            prContainer.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No Personal Records (PRs) recorded yet.</td></tr>';
            return;
        }

        prContainer.innerHTML = '';
        
        prKeys.forEach(id => {
            const pr = prs[id];
            const row = document.createElement('tr');
            row.innerHTML = `
                <td style="padding: 12px; font-weight: 500;">${pr.exerciseName}</td>
                <td style="padding: 12px; color: var(--accent-orange); font-weight: 600;">${pr.weight} kg x ${pr.reps}</td>
                <td style="padding: 12px; color: var(--accent-blue); font-weight: 700;">${pr.estimated1RM} kg</td>
                <td style="padding: 12px; color: var(--text-muted); font-size: 0.85rem;">${pr.date}</td>
            `;
            prContainer.appendChild(row);
        });
    },

    renderCharts() {
        this.destroyCharts();

        const activeAthleteId = window.App ? window.App.currentAthleteId : 'athlete_1';
        const activeTab = window.App ? window.App.currentAnalyticsTab : 'assess';
        const activeMode = window.App ? window.App.currentAnalyticsMode : 'individual';

        // Retrieve dynamic theme colors from CSS variables
        const computedStyle = getComputedStyle(document.body);
        const accentColor = computedStyle.getPropertyValue('--accent-blue').trim() || '#ea3a2a';
        const accentRgb = computedStyle.getPropertyValue('--accent-blue-rgb').trim() || '234, 58, 42';
        const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
        const textSecondary = computedStyle.getPropertyValue('--text-secondary').trim() || '#a1a1aa';
        const borderColor = computedStyle.getPropertyValue('--border-color').trim() || 'rgba(255, 255, 255, 0.08)';
        
        const orangeColor = computedStyle.getPropertyValue('--accent-orange').trim() || '#f87171';
        const greenColor = computedStyle.getPropertyValue('--accent-green').trim() || '#10b981';
        const redColor = computedStyle.getPropertyValue('--accent-red').trim() || '#ef4444';

        if (activeTab === 'assess') {
            const select = window.App ? window.App.analyticsTestSelect : null;
            const testId = select ? select.value : '';
            if (!testId) return;

            const testObj = window.Store.getTests().find(t => t.id === testId);
            const testName = testObj ? testObj.name : testId;
            const testUnit = testObj && testObj.unit ? ` ${testObj.unit}` : '';

            if (activeMode === 'individual') {
                const indivCtx = document.getElementById('analyticsIndivChartCanvas');
                const placeholder = document.getElementById('analytics-indiv-placeholder');
                
                const perfLogs = window.Store.getPerformanceLogs(activeAthleteId);
                const sortedLogs = [...perfLogs]
                    .filter(log => {
                        if (testId === 'weight') return log.athleteWeight !== undefined && log.athleteWeight !== null;
                        return log[testId] !== undefined && log[testId] !== null;
                    })
                    .sort((a, b) => new Date(a.date) - new Date(b.date));

                if (indivCtx && sortedLogs.length > 0) {
                    if (placeholder) placeholder.style.display = 'none';
                    indivCtx.style.display = 'block';

                    const labels = sortedLogs.map(l => l.date);
                    const data = sortedLogs.map(l => (testId === 'weight') ? l.athleteWeight : l[testId]);

                    this.analyticsIndivChart = new Chart(indivCtx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: [{
                                label: `${testName} (${testUnit.trim()})`,
                                data: data,
                                borderColor: accentColor,
                                backgroundColor: 'rgba(' + accentRgb + ', 0.05)',
                                borderWidth: 3,
                                pointBackgroundColor: accentColor,
                                pointBorderColor: textPrimary,
                                pointBorderWidth: 2,
                                pointRadius: 5,
                                pointHoverRadius: 7,
                                tension: 0.2,
                                fill: true
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: { display: false }
                            },
                            scales: {
                                x: {
                                    grid: { color: borderColor },
                                    ticks: { color: textSecondary }
                                },
                                y: {
                                    grid: { color: borderColor },
                                    ticks: { color: textSecondary }
                                }
                            }
                        }
                    });
                } else if (indivCtx) {
                    if (placeholder) placeholder.style.display = 'flex';
                    indivCtx.style.display = 'none';
                }
            } else if (activeMode === 'team') {
                const teamCtx = document.getElementById('analyticsTeamChartCanvas');
                const placeholder = document.getElementById('analytics-team-placeholder');
                const tableBody = document.getElementById('analytics-team-table-body');
                
                const athletes = window.Store.getAthletesOnly();
                const latestValues = [];

                athletes.forEach(ath => {
                    if (ath.performanceLogs) {
                        const logsWithData = ath.performanceLogs
                            .filter(log => {
                                if (testId === 'weight') return log.athleteWeight !== undefined && log.athleteWeight !== null;
                                return log[testId] !== undefined && log[testId] !== null;
                            })
                            .sort((a, b) => new Date(a.date) - new Date(b.date));
                        
                        if (logsWithData.length > 0) {
                            const latestLog = logsWithData[logsWithData.length - 1];
                            const val = (testId === 'weight') ? latestLog.athleteWeight : latestLog[testId];
                            latestValues.push({
                                athleteName: ath.fullName,
                                athleteNickname: ath.nickname,
                                value: val,
                                date: latestLog.date
                            });
                        }
                    }
                });

                const statAvg = document.getElementById('team-stat-avg');
                const statSd = document.getElementById('team-stat-sd');
                const statCv = document.getElementById('team-stat-cv');
                const statRec = document.getElementById('team-stat-rec');
                const statRecPanel = document.getElementById('team-stat-rec-panel');

                if (latestValues.length > 0) {
                    if (placeholder) placeholder.style.display = 'none';
                    if (teamCtx) teamCtx.style.display = 'block';

                    // Compute stats
                    const values = latestValues.map(v => v.value);
                    const sum = values.reduce((s, v) => s + v, 0);
                    const avg = sum / values.length;
                    
                    const variance = values.reduce((s, v) => s + Math.pow(v - avg, 2), 0) / values.length;
                    const sd = Math.sqrt(variance);
                    const cv = avg !== 0 ? (sd / avg) * 100 : 0;

                    // Update stats DOM
                    if (statAvg) statAvg.textContent = `${avg.toFixed(1)}${testUnit}`;
                    if (statSd) statSd.textContent = sd.toFixed(2);
                    if (statCv) statCv.textContent = `${cv.toFixed(1)}%`;
                    
                    if (statRec && statRecPanel) {
                        if (cv < 10) {
                            statRec.innerHTML = '🟢 CV < 10% (Low variation)<br><span style="font-size: 0.72rem; opacity: 0.85;">ไม่ต้องออกแบบโปรแกรมแยกซ้อม</span>';
                            statRecPanel.style.borderLeftColor = greenColor;
                        } else {
                            statRec.innerHTML = '⚠️ CV ≥ 10% (High variation)<br><span style="font-size: 0.72rem; opacity: 0.85;">ควรพิจารณาทำ Individual Programming</span>';
                            statRecPanel.style.borderLeftColor = orangeColor;
                        }
                    }

                    // Render table details
                    if (tableBody) {
                        tableBody.innerHTML = '';
                        latestValues.forEach(v => {
                            const diff = v.value - avg;
                            const diffText = diff >= 0 ? `+${diff.toFixed(1)}` : `${diff.toFixed(1)}`;
                            const diffColor = diff >= 0 ? greenColor : orangeColor;
                            const displayName = v.athleteNickname ? `${v.athleteName} (${v.athleteNickname})` : v.athleteName;

                            const tr = document.createElement('tr');
                            tr.innerHTML = `
                                <td style="padding: 12px; font-weight: 500;">${displayName}</td>
                                <td style="padding: 12px; text-align: center; font-weight: 600;">${v.value.toFixed(1)}${testUnit}</td>
                                <td style="padding: 12px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">${v.date}</td>
                                <td style="padding: 12px; text-align: center; color: ${diffColor}; font-weight: bold;">${diffText}${testUnit}</td>
                            `;
                            tableBody.appendChild(tr);
                        });
                    }

                    // Render Team Bar Chart with custom Avg Line Plugin
                    if (teamCtx) {
                        const labels = latestValues.map(v => v.athleteNickname || v.athleteName.split(' ')[0]);
                        
                        this.analyticsTeamChart = new Chart(teamCtx, {
                            type: 'bar',
                            data: {
                                labels: labels,
                                datasets: [{
                                    label: `${testName} (${testUnit.trim()})`,
                                    data: values,
                                    backgroundColor: 'rgba(' + accentRgb + ', 0.45)',
                                    borderColor: accentColor,
                                    borderWidth: 2,
                                    borderRadius: 6,
                                    hoverBackgroundColor: 'rgba(' + accentRgb + ', 0.7)'
                                }]
                            },
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {
                                    legend: { display: false }
                                },
                                scales: {
                                    x: {
                                        grid: { color: borderColor },
                                        ticks: { color: textSecondary }
                                    },
                                    y: {
                                        grid: { color: borderColor },
                                        ticks: { color: textSecondary }
                                    }
                                }
                            },
                            plugins: [{
                                id: 'averageLine',
                                afterDraw: (chart) => {
                                    const ctx = chart.ctx;
                                    const yScale = chart.scales.y;
                                    const xScale = chart.scales.x;
                                    const yVal = yScale.getPixelForValue(avg);
                                    
                                    ctx.save();
                                    ctx.beginPath();
                                    ctx.moveTo(xScale.left, yVal);
                                    ctx.lineTo(xScale.right, yVal);
                                    ctx.strokeStyle = '#ef4444'; // Red line for team average
                                    ctx.lineWidth = 2;
                                    ctx.setLineDash([5, 5]);
                                    ctx.stroke();
                                    
                                    // Text label for average line
                                    ctx.fillStyle = '#ffffff';
                                    ctx.font = '10px monospace';
                                    ctx.fillText(`AVG: ${avg.toFixed(1)}`, xScale.right - 90, yVal - 5);
                                    ctx.restore();
                                }
                            }]
                        });
                    }
                } else {
                    if (placeholder) placeholder.style.display = 'flex';
                    if (teamCtx) teamCtx.style.display = 'none';
                    if (statAvg) statAvg.textContent = '--';
                    if (statSd) statSd.textContent = '--';
                    if (statCv) statCv.textContent = '--%';
                    if (statRec) statRec.textContent = '--';
                    if (tableBody) tableBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No team data logged yet.</td></tr>';
                }
            }
        } else if (activeTab === 'workload') {
            const workouts = window.Store.getWorkouts(activeAthleteId);
            const wellness = window.Store.getWellnessLogs(activeAthleteId);

            workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
            wellness.sort((a, b) => new Date(a.date) - new Date(b.date));

            // 1. Volume Chart (Tonnage)
            const volCtx = document.getElementById('volumeChartCanvas');
            if (volCtx && workouts.length > 0) {
                const el = document.getElementById('vol-chart-placeholder');
                if (el) el.style.display = 'none';
                volCtx.style.display = 'block';

                const labels = workouts.map(w => w.date);
                const data = workouts.map(w => window.Store.calculateTotalVolume(w));

                this.volumeChart = new Chart(volCtx, {
                    type: 'bar',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Workload Volume (Tonnage Load - kg)',
                            data: data,
                            backgroundColor: 'rgba(' + accentRgb + ', 0.45)',
                            borderColor: accentColor,
                            borderWidth: 2,
                            borderRadius: 6,
                            hoverBackgroundColor: 'rgba(' + accentRgb + ', 0.7)'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            x: {
                                grid: { color: borderColor },
                                ticks: { color: textSecondary }
                            },
                            y: {
                                grid: { color: borderColor },
                                ticks: { color: textSecondary }
                            }
                        }
                    }
                });
            } else if (volCtx) {
                const el = document.getElementById('vol-chart-placeholder');
                if (el) el.style.display = 'flex';
                volCtx.style.display = 'none';
            }

            // 2. Readiness Chart
            const readyCtx = document.getElementById('readinessChartCanvas');
            if (readyCtx && wellness.length > 0) {
                const el = document.getElementById('ready-chart-placeholder');
                if (el) el.style.display = 'none';
                readyCtx.style.display = 'block';

                const labels = wellness.map(l => l.date);
                const data = wellness.map(l => window.Store.calculateReadiness(l));

                this.readinessChart = new Chart(readyCtx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Readiness Score (%)',
                            data: data,
                            borderColor: textPrimary,
                            backgroundColor: textPrimary === '#ffffff' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(30, 144, 255, 0.08)',
                            borderWidth: 3,
                            pointBackgroundColor: textPrimary,
                            pointBorderColor: accentColor,
                            pointBorderWidth: 2,
                            pointRadius: 5,
                            pointHoverRadius: 7,
                            tension: 0.3,
                            fill: true
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        },
                        scales: {
                            x: {
                                grid: { color: borderColor },
                                ticks: { color: textSecondary }
                            },
                            y: {
                                min: 0,
                                max: 100,
                                grid: { color: borderColor },
                                ticks: { color: textSecondary }
                            }
                        }
                    }
                });
            } else if (readyCtx) {
                const el = document.getElementById('ready-chart-placeholder');
                if (el) el.style.display = 'flex';
                readyCtx.style.display = 'none';
            }
        }
    }
};

window.AnalyticsModule = AnalyticsModule;
