const AnalyticsModule = {
    volumeChart: null,
    readinessChart: null,
    cmjChart: null,
    rsiChart: null,

    init() {
        this.renderAll();
    },

    renderAll() {
        this.renderCharts();
        this.renderPRTable();
    },

    destroyCharts() {
        if (this.volumeChart) { this.volumeChart.destroy(); this.volumeChart = null; }
        if (this.readinessChart) { this.readinessChart.destroy(); this.readinessChart = null; }
        if (this.cmjChart) { this.cmjChart.destroy(); this.cmjChart = null; }
        if (this.rsiChart) { this.rsiChart.destroy(); this.rsiChart = null; }
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
        
        // CMJ Baseline Calculation (excluding the latest log for true baseline comparison)
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
        
        // RSI Baseline Calculation (excluding the latest log for true baseline comparison)
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
        // Destroy existing chart instances to re-render fresh
        if (this.volumeChart) this.volumeChart.destroy();
        if (this.readinessChart) this.readinessChart.destroy();
        if (this.cmjChart) this.cmjChart.destroy();
        if (this.rsiChart) this.rsiChart.destroy();

        const activeAthleteId = window.App ? window.App.currentAthleteId : 'athlete_1';
        
        const workouts = window.Store.getWorkouts(activeAthleteId);
        const wellness = window.Store.getWellnessLogs(activeAthleteId);
        const perfLogs = window.Store.getPerformanceLogs(activeAthleteId);

        // Sort by date ascending for charts
        workouts.sort((a, b) => new Date(a.date) - new Date(b.date));
        wellness.sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Filter performance logs that have CMJ / RSI and sort them by date
        const sortedPerfLogs = [...perfLogs]
            .filter(log => log.date)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        // Retrieve dynamic theme colors from CSS variables
        const computedStyle = getComputedStyle(document.body);
        const accentColor = computedStyle.getPropertyValue('--accent-blue').trim() || '#ea3a2a';
        const accentRgb = computedStyle.getPropertyValue('--accent-blue-rgb').trim() || '234, 58, 42';
        const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
        const textSecondary = computedStyle.getPropertyValue('--text-secondary').trim() || '#a1a1aa';
        const borderColor = computedStyle.getPropertyValue('--border-color').trim() || 'rgba(255, 255, 255, 0.08)';
        
        const orangeColor = computedStyle.getPropertyValue('--accent-orange').trim() || '#f87171';
        const hexToRgb = (hex) => {
            hex = hex.replace('#', '');
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            return `${r}, ${g}, ${b}`;
        };
        const orangeRgb = hexToRgb(orangeColor);

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
                        borderColor: textPrimary,                     // Theme adaptive line
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

        // 3. CMJ Jump Height Chart
        const cmjCtx = document.getElementById('cmjChartCanvas');
        const cmjLogs = sortedPerfLogs.filter(log => log.cmj !== null);
        if (cmjCtx && cmjLogs.length > 0) {
            const el = document.getElementById('cmj-chart-placeholder');
            if (el) el.style.display = 'none';
            cmjCtx.style.display = 'block';

            const labels = cmjLogs.map(l => l.date);
            const data = cmjLogs.map(l => l.cmj);

            this.cmjChart = new Chart(cmjCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Countermovement Jump (cm)',
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
        } else if (cmjCtx) {
            const el = document.getElementById('cmj-chart-placeholder');
            if (el) el.style.display = 'flex';
            cmjCtx.style.display = 'none';
        }

        // 4. 10/5 RSI Chart
        const rsiCtx = document.getElementById('rsiChartCanvas');
        const rsiLogs = sortedPerfLogs.filter(log => log.rsi !== null);
        if (rsiCtx && rsiLogs.length > 0) {
            const el = document.getElementById('rsi-chart-placeholder');
            if (el) el.style.display = 'none';
            rsiCtx.style.display = 'block';

            const labels = rsiLogs.map(l => l.date);
            const data = rsiLogs.map(l => l.rsi);

            this.rsiChart = new Chart(rsiCtx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Reactive Strength Index (10/5 RSI)',
                        data: data,
                        borderColor: orangeColor,
                        backgroundColor: 'rgba(' + orangeRgb + ', 0.05)',
                        borderWidth: 3,
                        pointBackgroundColor: orangeColor,
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
        } else if (rsiCtx) {
            const el = document.getElementById('rsi-chart-placeholder');
            if (el) el.style.display = 'flex';
            rsiCtx.style.display = 'none';
        }
    }
};

window.AnalyticsModule = AnalyticsModule;
