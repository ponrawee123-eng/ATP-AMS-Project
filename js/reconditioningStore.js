// =============================================================================
//  js/reconditioningStore.js - Independent Reconditioning / Injury Tracking Store
//  Completely isolated from standard performance metrics (store.js).
// =============================================================================

const RECON_STORAGE_KEYS = {
    CASES: 'personal_ams_recon_cases',
    LOGS:  'personal_ams_recon_logs'
};

const ReconStore = {

    // ── Case Management ─────────────────────────────────────────────────────
    getCases() {
        return JSON.parse(localStorage.getItem(RECON_STORAGE_KEYS.CASES)) || [];
    },

    getCaseById(caseId) {
        return this.getCases().find(c => c.id === caseId) || null;
    },

    getActiveCaseForAthlete(athleteId) {
        return this.getCases().find(c => c.athleteId === athleteId && c.status === 'active') || null;
    },

    saveCase(reconCase) {
        const cases = this.getCases();
        const idx = cases.findIndex(c => c.id === reconCase.id);
        if (idx > -1) {
            cases[idx] = reconCase;
        } else {
            cases.push(reconCase);
        }
        localStorage.setItem(RECON_STORAGE_KEYS.CASES, JSON.stringify(cases));
        return reconCase;
    },

    deleteCase(caseId) {
        const cases = this.getCases().filter(c => c.id !== caseId);
        localStorage.setItem(RECON_STORAGE_KEYS.CASES, JSON.stringify(cases));
        // Also purge associated logs
        const logs = this.getAllLogs().filter(l => l.caseId !== caseId);
        localStorage.setItem(RECON_STORAGE_KEYS.LOGS, JSON.stringify(logs));
    },

    // ── Progress Logs ────────────────────────────────────────────────────────
    getAllLogs() {
        return JSON.parse(localStorage.getItem(RECON_STORAGE_KEYS.LOGS)) || [];
    },

    getLogs(caseId) {
        return this.getAllLogs()
            .filter(log => log.caseId === caseId)
            .sort((a, b) => new Date(a.date) - new Date(b.date));
    },

    logProgress(progressEntry) {
        const allLogs = this.getAllLogs();
        allLogs.push({
            id: Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            ...progressEntry
        });
        localStorage.setItem(RECON_STORAGE_KEYS.LOGS, JSON.stringify(allLogs));
        return progressEntry;
    },

    deleteLog(logId) {
        const logs = this.getAllLogs().filter(l => l.id !== logId);
        localStorage.setItem(RECON_STORAGE_KEYS.LOGS, JSON.stringify(logs));
    },

    // ── Time Elapsed Calculator ──────────────────────────────────────────────
    calculateTimeElapsed(startDateStr) {
        if (!startDateStr) return 'N/A';
        const start = new Date(startDateStr);
        const now = new Date();
        if (isNaN(start.getTime()) || start > now) return 'N/A';

        let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
        const tempDate = new Date(start);
        tempDate.setMonth(tempDate.getMonth() + months);
        if (tempDate > now) {
            months--;
            tempDate.setMonth(tempDate.getMonth() - 1);
        }
        const days = Math.floor((now - tempDate) / (1000 * 60 * 60 * 24));

        if (months === 0 && days === 0) return 'วันนี้';
        if (months === 0) return `${days} วัน`;
        return `${months} เดือน ${days} วัน`;
    },

    // ── Limb Symmetry Index (LSI) ────────────────────────────────────────────
    calculateLSI(involved, uninvolved) {
        const inv = parseFloat(involved);
        const uninv = parseFloat(uninvolved);
        if (!uninv || isNaN(inv) || isNaN(uninv) || uninv === 0) return null;
        return ((inv / uninv) * 100).toFixed(1);
    }
};

window.ReconStore = ReconStore;
