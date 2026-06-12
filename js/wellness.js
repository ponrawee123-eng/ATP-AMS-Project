const WellnessModule = {
    currentDate: null,

    init() {
        this.currentDate = window.Store.getLocalDateString();
        this.cacheDOM();
        this.bindEvents();
        this.loadDateData(this.currentDate);
    },

    cacheDOM() {
        this.wellnessDateInput = document.getElementById('wellness-date');
        this.sleepSlider = document.getElementById('slider-sleep');
        this.sorenessSlider = document.getElementById('slider-soreness');
        this.energySlider = document.getElementById('slider-energy');
        this.stressSlider = document.getElementById('slider-stress');
        
        this.sleepVal = document.getElementById('val-sleep');
        this.sorenessVal = document.getElementById('val-soreness');
        this.energyVal = document.getElementById('val-energy');
        this.stressVal = document.getElementById('val-stress');
        
        this.wellnessScoreDisplay = document.getElementById('wellness-score-percent');
        this.wellnessSaveBtn = document.getElementById('save-wellness-btn');
    },

    bindEvents() {
        // Handle slider changes
        const sliders = [
            { slider: this.sleepSlider, display: this.sleepVal },
            { slider: this.sorenessSlider, display: this.sorenessVal },
            { slider: this.energySlider, display: this.energyVal },
            { slider: this.stressSlider, display: this.stressVal }
        ];

        sliders.forEach(item => {
            if (item.slider) {
                item.slider.addEventListener('input', (e) => {
                    item.display.textContent = e.target.value;
                    this.updateCurrentScore();
                });
            }
        });

        // Date selection change
        if (this.wellnessDateInput) {
            this.wellnessDateInput.addEventListener('change', (e) => {
                this.currentDate = e.target.value;
                this.loadDateData(this.currentDate);
            });
        }

        // Save button click
        if (this.wellnessSaveBtn) {
            this.wellnessSaveBtn.addEventListener('click', () => {
                this.saveCurrentWellness();
            });
        }
    },

    loadDateData(dateStr) {
        if (this.wellnessDateInput) {
            this.wellnessDateInput.value = dateStr;
        }

        const log = window.Store.getWellnessForDate(window.App.currentAthleteId, dateStr);
        if (log) {
            this.sleepSlider.value = log.sleep;
            this.sorenessSlider.value = log.soreness;
            this.energySlider.value = log.energy;
            this.stressSlider.value = log.stress;
        } else {
            // Default middle scores
            this.sleepSlider.value = 7;
            this.sorenessSlider.value = 7;
            this.energySlider.value = 7;
            this.stressSlider.value = 7;
        }

        // Trigger text updates
        this.sleepVal.textContent = this.sleepSlider.value;
        this.sorenessVal.textContent = this.sorenessSlider.value;
        this.energyVal.textContent = this.energySlider.value;
        this.stressVal.textContent = this.stressSlider.value;

        this.updateCurrentScore();
    },

    updateCurrentScore() {
        const sleep = parseInt(this.sleepSlider.value);
        const soreness = parseInt(this.sorenessSlider.value);
        const energy = parseInt(this.energySlider.value);
        const stress = parseInt(this.stressSlider.value);
        
        const readiness = window.Store.calculateReadiness({ sleep, soreness, energy, stress });
        if (this.wellnessScoreDisplay) {
            this.wellnessScoreDisplay.textContent = `${readiness}%`;
        }
    },

    saveCurrentWellness() {
        const sleep = parseInt(this.sleepSlider.value);
        const soreness = parseInt(this.sorenessSlider.value);
        const energy = parseInt(this.energySlider.value);
        const stress = parseInt(this.stressSlider.value);

        const log = {
            athleteId: window.App.currentAthleteId,
            date: this.currentDate,
            sleep,
            soreness,
            energy,
            stress
        };

        window.Store.saveWellness(log);
        
        // Custom notification/alert (premium look)
        this.showToast('Daily wellness metrics saved successfully!', 'success');
        
        // Refresh dashboard and analytics
        if (window.App) {
            window.App.updateDashboard();
        }
    },

    showToast(message, type = 'info') {
        let toast = document.getElementById('app-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'app-toast';
            toast.style.position = 'fixed';
            toast.style.bottom = '24px';
            toast.style.left = '50%';
            toast.style.transform = 'translateX(-50%) translateY(100px)';
            toast.style.padding = '12px 24px';
            toast.style.borderRadius = '30px';
            toast.style.color = '#fff';
            toast.style.fontFamily = 'inherit';
            toast.style.fontSize = '0.9rem';
            toast.style.fontWeight = '500';
            toast.style.zIndex = '999';
            toast.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            toast.style.backdropFilter = 'blur(10px)';
            toast.style.border = '1px solid rgba(255, 255, 255, 0.1)';
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        if (type === 'success') {
            toast.style.background = 'rgba(234, 58, 42, 0.85)';
            toast.style.boxShadow = '0 0 20px rgba(234, 58, 42, 0.4)';
        } else if (type === 'danger') {
            toast.style.background = 'rgba(239, 68, 68, 0.85)';
            toast.style.boxShadow = '0 0 20px rgba(239, 68, 68, 0.4)';
        } else {
            toast.style.background = 'rgba(234, 58, 42, 0.85)';
            toast.style.boxShadow = '0 0 20px rgba(234, 58, 42, 0.4)';
        }

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(0)';
        }, 50);

        setTimeout(() => {
            toast.style.transform = 'translateX(-50%) translateY(100px)';
        }, 3000);
    }
};

window.WellnessModule = WellnessModule;
