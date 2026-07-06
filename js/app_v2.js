// YouTube Iframe Player API Global Callback
function initYoutubePlayer() {
    if (window.ytPlayer) return;
    if (typeof YT !== 'undefined' && YT.Player) {
        window.ytPlayer = new YT.Player('youtube-player', {
            height: '200',
            width: '200',
            videoId: '', // start empty
            playerVars: {
                playsinline: 1,
                autoplay: 0,
                loop: 1
            },
            events: {
                onReady: (event) => {
                    console.log('YouTube Player Ready');
                    if (window.App) {
                        window.App.isYtPlayerReady = true;
                        window.App.executePendingYtAction();
                    }
                },
                onStateChange: (event) => {
                    // If ended, loop is enabled, and not playing a playlist, replay the video
                    if (event.data === YT.PlayerState.ENDED) {
                        if (window.App && window.App.isBgmLooping && !window.App.isPlaylistActive) {
                            event.target.playVideo();
                        }
                    }
                },
                onError: (event) => {
                    console.error('YouTube Player Error:', event.data);
                }
            }
        });
    }
}

window.onYouTubeIframeAPIReady = function() {
    initYoutubePlayer();
};

// Check if YT is already loaded when script executes
if (typeof YT !== 'undefined' && YT.Player) {
    initYoutubePlayer();
} else {
    // Poll for a few seconds just in case the API finishes loading slightly later
    let checkCount = 0;
    const interval = setInterval(() => {
        checkCount++;
        if (typeof YT !== 'undefined' && YT.Player) {
            initYoutubePlayer();
            clearInterval(interval);
        }
        if (checkCount > 50) { // check for up to 5 seconds
            clearInterval(interval);
        }
    }, 100);
}

const App = {
    currentAthleteId: 'athlete_1',
    activeRosterAthleteId: null,
    tempPhotoBase64: null,
    isMuted: true,
    bgmType: 'youtube',
    isBgmLooping: true,
    isPlaylistActive: false,
    isYtPlayerReady: false,
    pendingYtAction: null,
    currentYtVideoId: null,
    userRole: localStorage.getItem('atp_user_role') || 'user',
    _metronomeInterval: null,
    _audioContext: null,

    getAthleteDisplayName(athlete) {
        if (!athlete) return 'Unknown';
        const team = athlete.team ? athlete.team.trim() : 'Unattached';
        const nickname = athlete.nickname ? athlete.nickname.trim() : '';
        const name = nickname || (athlete.fullName ? athlete.fullName.split(' ')[0] : 'Athlete');
        return `[${team}] ${name}`;
    },

    init() {
        window.Store.init();
        if (window.updateSyncUI) window.updateSyncUI();
        
        // Initialize local storage arrays for programs and match logs
        if (!localStorage.getItem('atp_master_programs')) {
            localStorage.setItem('atp_master_programs', JSON.stringify([]));
        }
        if (!localStorage.getItem('atp_match_logs')) {
            localStorage.setItem('atp_match_logs', JSON.stringify([]));
        }

        this.cacheDOM();
        this.extendWorkoutModule(); // Extend WorkoutModule before initializing it!
        this.bindEvents();
        
        // Render today's tests checkboxes bar dynamically on load
        this.renderTodayTestsChecklist();

        this.initTheme();
        this.initClock();
        
        this.populateAthleteSelect();
        const athletes = window.Store.getAthletesOnly();
        if (athletes.length > 0) {
            this.currentAthleteId = athletes[0].id;
            this.globalAthleteSelect.value = this.currentAthleteId;
        }

        window.WellnessModule.init();
        window.WorkoutModule.init();
        window.AnalyticsModule.init();
        window.PeriodizationModule.init();
        
        this.updateDashboard();
        this.renderExerciseLibrary();
        this.renderRosterList();

        // Initialize Team Match Logs view logic
        this.initMatchLogView();

        // Show hero landing gate by default — app container stays hidden
        // until user picks a fast-pass
        this.updateRoleUI();
        this.initSidebarToggle();
        this.triggerInitialPrNotification();
        this.updateLandingPageStats();
    },

    heroLaunch(mode) {
        const heroView = document.getElementById('hero-landing-view');
        const appContainer = document.getElementById('app-main-container');
        if (heroView) {
            heroView.style.opacity = '0';
            setTimeout(() => {
                heroView.style.display = 'none';
            }, 300);
        }

        if (appContainer) {
            appContainer.style.display = '';
            appContainer.style.opacity = '0';
            appContainer.style.transform = 'translateY(20px)';
            appContainer.style.transition = 'opacity 0.3s cubic-bezier(0.4, 0, 0.2, 1), transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)';
            // Force reflow
            appContainer.offsetHeight;
            appContainer.style.opacity = '1';
            appContainer.style.transform = 'translateY(0)';
        }

        if (mode === 'live-tracker') {
            this.switchView('live-tracker');
        } else if (mode === 'team') {
            this.switchView('team-management');
        } else if (mode === 'gym') {
            this.switchView('weight-room');
        } else if (mode === 'recon') {
            this.switchView('reconditioning');
        } else {
            this.switchView('live-tracker');
        }
    },

    returnToHeroGate() {
        const heroView = document.getElementById('hero-landing-view');
        const appContainer = document.getElementById('app-main-container');

        if (appContainer) {
            appContainer.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            appContainer.style.opacity = '0';
            appContainer.style.transform = 'translateY(20px)';
            setTimeout(() => {
                appContainer.style.display = 'none';
            }, 300);
        }

        if (heroView) {
            heroView.style.display = 'flex';
            heroView.style.opacity = '0';
            heroView.style.transition = 'opacity 0.3s ease';
            // Force reflow
            heroView.offsetHeight;
            heroView.style.opacity = '1';
        }

        // Trigger a fresh system status calculation scan
        this.updateDashboard();
        this.updateLandingPageStats();

        // Remove active class from all nav items
        this.navItems.forEach(item => {
            item.classList.remove('active');
        });
    },

    updateLandingPageStats() {
        try {
            // 1. Team stats
            const athletesCount = window.Store.getAthletesOnly().length;
            
            const allWellness = JSON.parse(localStorage.getItem('personal_ams_wellness')) || [];
            const todayStr = window.Store.getLocalDateString();
            const todayLogs = allWellness.filter(log => log.date === todayStr);
            let avgReadiness = 0;
            if (todayLogs.length > 0) {
                const sum = todayLogs.reduce((acc, log) => acc + window.Store.calculateReadiness(log), 0);
                avgReadiness = Math.round(sum / todayLogs.length);
            } else {
                avgReadiness = 85; // Default placeholder fallback
            }

            const teamStatsEl = document.getElementById('hero-stats-team');
            if (teamStatsEl) {
                teamStatsEl.innerHTML = `
                    <div class="hero-stat-row"><span>Rostered Athletes:</span><strong>${athletesCount}</strong></div>
                    <div class="hero-stat-row"><span>Today's Avg Readiness:</span><strong>${avgReadiness}%</strong></div>
                `;
            }

            // 2. Weight room stats
            const allWorkouts = JSON.parse(localStorage.getItem('personal_ams_workouts')) || [];
            const workoutsCount = allWorkouts.length;
            let totalTonnage = 0;
            allWorkouts.forEach(workout => {
                let vol = window.Store.calculateTotalVolume(workout);
                if (vol === 0) {
                    // Fallback to all sets weight * reps
                    workout.exercises.forEach(ex => {
                        ex.sets.forEach(set => {
                            if (set.weight && set.reps) {
                                vol += parseFloat(set.weight) * parseInt(set.reps);
                            }
                        });
                    });
                }
                totalTonnage += vol;
            });

            const gymStatsEl = document.getElementById('hero-stats-gym');
            if (gymStatsEl) {
                gymStatsEl.innerHTML = `
                    <div class="hero-stat-row"><span>Logged Workouts:</span><strong>${workoutsCount}</strong></div>
                    <div class="hero-stat-row"><span>Total Volume Load:</span><strong>${totalTonnage.toLocaleString()} kg</strong></div>
                `;
            }

            // 3. Reconditioning stats
            const activeCases = window.ReconStore ? window.ReconStore.getCases().filter(c => c.status === 'active').length : 0;
            const completedRehabs = window.ReconStore ? window.ReconStore.getCases().filter(c => c.status === 'resolved').length : 0;

            const reconStatsEl = document.getElementById('hero-stats-recon');
            if (reconStatsEl) {
                reconStatsEl.innerHTML = `
                    <div class="hero-stat-row"><span>Active Rehab Cases:</span><strong>${activeCases}</strong></div>
                    <div class="hero-stat-row"><span>Resolved Injuries:</span><strong>${completedRehabs}</strong></div>
                `;
            }

            // Sync BGM Status Indicator text/color on Landing
            const heroBgmStatus = document.getElementById('hero-bgm-status');
            if (heroBgmStatus) {
                heroBgmStatus.textContent = this.isMuted ? 'MUTED' : 'PLAYING';
                heroBgmStatus.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-orange)';
            }
        } catch (e) {
            console.error('Error loading landing page stats:', e);
        }
    },

    cacheDOM() {
        this.navItems = document.querySelectorAll('.nav-item');
        this.views = document.querySelectorAll('.view');
        this.globalAthleteSelect = document.getElementById('global-athlete-select');
        this.sidebarUserAvatar = document.getElementById('sidebar-user-avatar');
        this.sidebarUserName = document.getElementById('sidebar-user-name');
        this.sidebarUserTeam = document.getElementById('sidebar-user-team');
        this.btnReturnHero = document.getElementById('btn-return-hero');
        this.bgmMuteBtn = document.getElementById('bgm-mute-btn');
        this.metronomeSwitch = document.getElementById('metronome-switch');
        this.metronomeControls = document.getElementById('metronome-controls');
        this.metronomeBpm = document.getElementById('metronome-bpm');
        this.bpmDisplay = document.getElementById('bpm-display');
        this.dashReadinessNum = document.getElementById('dash-readiness-num');
        this.dashReadinessSub = document.getElementById('dash-readiness-sub');
        this.dashVolumeNum = document.getElementById('dash-volume-num');
        this.dashWorkoutsNum = document.getElementById('dash-workouts-num');
        this.dashPrsNum = document.getElementById('dash-prs-num');
        this.dashHistoryTable = document.getElementById('dash-history-body');
        this.progressCircle = document.getElementById('readiness-circle-progress');
        
        // New Dashboard Elements
        this.dashTrendTestSelect = document.getElementById('dash-trend-test-select');
        this.dashTrendChartCanvas = document.getElementById('dashTrendChartCanvas');
        this.dashTrendPlaceholder = document.getElementById('dash-trend-placeholder');
        this.dashUpcomingTournaments = document.getElementById('dash-upcoming-tournaments');
        this.dashRecentMatches = document.getElementById('dash-recent-matches');
        
        // New Analytics Elements
        this.analyticsTestSelect = document.getElementById('analytics-test-select');
        this.quoteText = document.getElementById('quote-text');
        this.quoteAuthor = document.getElementById('quote-author');
        this.libraryGrid = document.getElementById('exercise-library-grid');
        this.libExName = document.getElementById('lib-ex-name');
        this.libExCategory = document.getElementById('lib-ex-category');
        this.libExMuscle = document.getElementById('lib-ex-muscle');
        this.addLibExBtn = document.getElementById('add-lib-ex-btn');
        this.libSearchInput = document.getElementById('lib-search-input');
        this.libSearchClear = document.getElementById('lib-search-clear');
        this.libSortSelect = document.getElementById('lib-sort-select');
        this.libCategoryTabs = document.getElementById('library-category-tabs');
        this.libEmptyState = document.getElementById('library-empty-state');
        this.resetLibFiltersBtn = document.getElementById('reset-lib-filters-btn');
        this.rosterListContainer = document.getElementById('roster-athlete-list');
        this.athleteDetailsPanel = document.getElementById('athlete-details-panel');
        this.athleteDetailsEmpty = document.getElementById('athlete-details-empty');
        this.addAthleteBtn = document.getElementById('add-athlete-btn');
        this.athleteFullname = document.getElementById('athlete-fullname');
        this.athleteNickname = document.getElementById('athlete-nickname');
        this.athleteDob = document.getElementById('athlete-dob');
        this.athleteAgeCalc = document.getElementById('athlete-age-calc');
        this.athleteTeam = document.getElementById('athlete-team');
        this.athletePhotoInput = document.getElementById('athlete-photo-input');
        this.avatarPreviewTrigger = document.getElementById('avatar-preview-trigger');
        this.avatarInitialsLg = document.getElementById('avatar-initials-lg');
        this.avatarImgLg = document.getElementById('avatar-img-lg');
        this.saveAthleteProfileBtn = document.getElementById('save-athlete-profile-btn');
        this.deleteAthleteProfileBtn = document.getElementById('delete-athlete-profile-btn');
        
        // Performance Form Cache (Updated for 3-trial CMJ Precision layout)
        this.perfLogDate = document.getElementById('perf-log-date');
        this.perfCmjT1 = document.getElementById('perf-cmj-t1');
        this.perfCmjT2 = document.getElementById('perf-cmj-t2');
        this.perfCmjT3 = document.getElementById('perf-cmj-t3');
        this.perfCmjMean = document.getElementById('perf-cmj-mean');
        this.perfCmjSd = document.getElementById('perf-cmj-sd');
        this.perfCmjCv = document.getElementById('perf-cmj-cv');
        this.perfCmjStatusBadge = document.getElementById('perf-cmj-status-badge');
        
        this.perfRsi = document.getElementById('perf-rsi');
        this.perfAthleteWeight = document.getElementById('perf-athlete-weight');
        this.perfE1rmWeight = document.getElementById('perf-e1rm-weight');
        this.perfE1rmReps = document.getElementById('perf-e1rm-reps');
        this.perfE1rmResult = document.getElementById('perf-e1rm-result');
        this.savePerfLogBtn = document.getElementById('save-perf-log-btn');
        this.perfHistoryBody = document.getElementById('perf-history-body');

        // Dual Mode Assessments Cache
        this.assessmentTabIndividual = document.getElementById('assessment-tab-individual');
        this.assessmentTabTeam = document.getElementById('assessment-tab-team');
        this.assessmentPanelIndividual = document.getElementById('assessment-panel-individual');
        this.assessmentPanelTeam = document.getElementById('assessment-panel-team');
        this.teamPerfLogDate = document.getElementById('team-perf-log-date');
        this.teamBulkBody = document.getElementById('team-bulk-body');
        this.teamBulkFilterSelect = document.getElementById('team-bulk-filter-select');
        this.saveTeamPerfBtn = document.getElementById('save-team-perf-btn');
        this.newTestForm = document.getElementById('new-test-form');
        this.newTestName = document.getElementById('new-test-name');
        this.newTestUnit = document.getElementById('new-test-unit');
        this.newTestCategory = document.getElementById('new-test-category');
        this.testManagerBody = document.getElementById('test-manager-body');
        
        // CNS fatigue and theme toggle
        this.cnsFatigueBadge = document.getElementById('cns-fatigue-badge');
        this.themeToggleBtn = document.getElementById('theme-toggle-btn');
        this.themeBtnText = document.getElementById('theme-btn-text');

        // Reconditioning DOM Cache
        this.reconAthleteSelect = document.getElementById('recon-athlete-select');
        this.reconInjuryDate = document.getElementById('recon-injury-date');
        this.reconSurgeryDate = document.getElementById('recon-surgery-date');
        this.reconElapsedInjury = document.getElementById('recon-elapsed-injury');
        this.reconElapsedSurgery = document.getElementById('recon-elapsed-surgery');
        this.reconInjuryDesc = document.getElementById('recon-injury-desc');
        this.reconSaveCaseBtn = document.getElementById('recon-save-case-btn');
        this.reconDeleteCaseBtn = document.getElementById('recon-delete-case-btn');
        this.reconLogDate = document.getElementById('recon-log-date');
        this.reconQuadInvolved = document.getElementById('recon-quad-involved');
        this.reconQuadUninvolved = document.getElementById('recon-quad-uninvolved');
        this.reconQuadLsi = document.getElementById('recon-quad-lsi');
        this.reconHopLeft = document.getElementById('recon-hop-left');
        this.reconHopRight = document.getElementById('recon-hop-right');
        this.reconHopLsi = document.getElementById('recon-hop-lsi');
        this.reconLateralLeft = document.getElementById('recon-lateral-left');
        this.reconLateralRight = document.getElementById('recon-lateral-right');
        this.reconLateralLsi = document.getElementById('recon-lateral-lsi');
        this.reconLogProgressBtn = document.getElementById('recon-log-progress-btn');
        this.reconHistoryBody = document.getElementById('recon-history-body');

        // Match Log DOM Cache
        this.matchLogTitle = document.getElementById('match-log-title');
        this.matchLogDate = document.getElementById('match-log-date');
        this.matchLogEndDate = document.getElementById('match-log-end-date');
        this.matchLogOpponent = document.getElementById('match-log-opponent');
        this.matchLogAtpScore = document.getElementById('match-log-atp-score');
        this.matchLogOppScore = document.getElementById('match-log-opp-score');
        this.matchLogAttendanceGrid = document.getElementById('match-log-attendance-grid');
        this.matchLogNotes = document.getElementById('match-log-notes');
        this.saveMatchLogBtn = document.getElementById('save-match-log-btn');
        this.matchLogHistoryBody = document.getElementById('match-log-history-body');

        // Weight Room DOM Cache
        this.weightRoomGrid = document.getElementById('weight-room-grid');
        this.weightRoomStatus = document.getElementById('weight-room-status');
        this.weightRoomClock = document.getElementById('weight-room-clock');
        this.weightRoomDateSelect = document.getElementById('weight-room-date-select');

        // Webcam Cache
        this.photoSourceModal = document.getElementById('photo-source-modal');
        this.photoSourceUpload = document.getElementById('photo-source-upload');
        this.photoSourceWebcam = document.getElementById('photo-source-webcam');
        this.photoSourceCancel = document.getElementById('photo-source-cancel');
        this.webcamContainer = document.getElementById('webcam-container');
        this.webcamVideo = document.getElementById('webcam-video');
        this.webcamSnapBtn = document.getElementById('webcam-snap-btn');
        this.webcamCancelBtn = document.getElementById('webcam-cancel-btn');
    },

    bindEvents() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const viewId = item.getAttribute('data-view');
                if (viewId) this.switchView(viewId);
            });
        });

        if (this.globalAthleteSelect) {
            this.globalAthleteSelect.addEventListener('change', (e) => {
                this.currentAthleteId = e.target.value;
                this.handleAthleteSwitch();
            });
        }

        if (this.themeToggleBtn) {
            this.themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }

        if (this.btnReturnHero) {
            this.btnReturnHero.addEventListener('click', () => {
                this.returnToHeroGate();
            });
        }

        if (this.bgmMuteBtn) {
            this.bgmMuteBtn.addEventListener('click', () => this.toggleMute());
        }

        if (this.metronomeSwitch) {
            this.metronomeSwitch.addEventListener('change', (e) => {
                if (this.metronomeControls) {
                    if (e.target.checked) {
                        this.metronomeControls.style.display = 'flex';
                        this.startMetronome();
                    } else {
                        this.metronomeControls.style.display = 'none';
                        this.stopMetronome();
                    }
                }
            });
        }

        if (this.metronomeBpm) {
            this.metronomeBpm.addEventListener('input', (e) => {
                if (this.bpmDisplay) {
                    this.bpmDisplay.textContent = `${e.target.value} BPM`;
                }
                if (this.metronomeSwitch && this.metronomeSwitch.checked) {
                    this.stopMetronome();
                    this.startMetronome();
                }
            });
        }

        if (this.addLibExBtn) this.addLibExBtn.addEventListener('click', () => this.addExerciseToLibrary());

        // Tracking coordinates for hero-card hover glow effect
        document.querySelectorAll('.hero-card').forEach(card => {
            card.addEventListener('mousemove', (e) => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                card.style.setProperty('--x', `${x}px`);
                card.style.setProperty('--y', `${y}px`);
            });
        });
        if (this.libSearchInput) {
            this.libSearchInput.addEventListener('input', () => {
                if (this.libSearchClear) {
                    this.libSearchClear.style.display = this.libSearchInput.value ? 'block' : 'none';
                }
                this.renderExerciseLibrary();
            });
        }
        if (this.libSearchClear) {
            this.libSearchClear.addEventListener('click', () => {
                this.libSearchInput.value = '';
                this.libSearchClear.style.display = 'none';
                this.renderExerciseLibrary();
            });
        }
        if (this.libSortSelect) {
            this.libSortSelect.addEventListener('change', () => {
                this.renderExerciseLibrary();
            });
        }
        if (this.libCategoryTabs) {
            this.libCategoryTabs.addEventListener('click', (e) => {
                const btn = e.target.closest('.tab-btn');
                if (btn) {
                    this.libCategoryTabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                    btn.classList.add('active');
                    this.renderExerciseLibrary();
                }
            });
        }
        if (this.resetLibFiltersBtn) {
            this.resetLibFiltersBtn.addEventListener('click', () => {
                if (this.libSearchInput) {
                    this.libSearchInput.value = '';
                }
                if (this.libSearchClear) {
                    this.libSearchClear.style.display = 'none';
                }
                if (this.libCategoryTabs) {
                    this.libCategoryTabs.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
                    const allTab = this.libCategoryTabs.querySelector('[data-category="all"]');
                    if (allTab) allTab.classList.add('active');
                }
                if (this.libSortSelect) {
                    this.libSortSelect.value = 'name-asc';
                }
                this.renderExerciseLibrary();
            });
        }
        if (this.addAthleteBtn) this.addAthleteBtn.addEventListener('click', () => this.initNewAthleteForm());
        if (this.saveAthleteProfileBtn) this.saveAthleteProfileBtn.addEventListener('click', () => this.saveAthleteProfile());
        if (this.deleteAthleteProfileBtn) this.deleteAthleteProfileBtn.addEventListener('click', () => this.deleteAthleteProfile());

        if (this.avatarPreviewTrigger) {
            this.avatarPreviewTrigger.addEventListener('click', () => this.selectPhotoSource());
        }
        if (this.athletePhotoInput) {
            this.athletePhotoInput.addEventListener('change', (e) => this.handlePhotoUpload(e));
        }
        if (this.photoSourceUpload) {
            this.photoSourceUpload.addEventListener('click', () => {
                this.hidePhotoSourceModal();
                if (this.athletePhotoInput) this.athletePhotoInput.click();
            });
        }
        if (this.photoSourceWebcam) {
            this.photoSourceWebcam.addEventListener('click', () => {
                this.hidePhotoSourceModal();
                this.startWebcam();
            });
        }
        if (this.photoSourceCancel) {
            this.photoSourceCancel.addEventListener('click', () => this.hidePhotoSourceModal());
        }
        if (this.webcamSnapBtn) {
            this.webcamSnapBtn.addEventListener('click', () => this.captureWebcam());
        }
        if (this.webcamCancelBtn) {
            this.webcamCancelBtn.addEventListener('click', () => this.stopWebcam());
        }

        if (this.athleteDob) {
            this.athleteDob.addEventListener('change', (e) => {
                this.athleteAgeCalc.value = this.calculateAge(e.target.value);
            });
        }

        const calcE1rm = () => {
            const w = parseFloat(this.perfE1rmWeight.value) || 0;
            const r = parseInt(this.perfE1rmReps.value) || 0;
            this.perfE1rmResult.textContent = (w && r) ? `${window.Store.estimateOneRepMax(w, r)} kg` : '0 kg';
        };
        if (this.perfE1rmWeight && this.perfE1rmReps) {
            this.perfE1rmWeight.addEventListener('input', calcE1rm);
            this.perfE1rmReps.addEventListener('input', calcE1rm);
        }

        if (this.savePerfLogBtn) this.savePerfLogBtn.addEventListener('click', () => this.savePerformanceEntry());
        if (this.perfLogDate) {
            this.perfLogDate.addEventListener('change', () => this.loadIndividualAssessmentForDate());
        }
        
        // Listeners for CMJ trials real-time analytics
        const cmjInputs = [this.perfCmjT1, this.perfCmjT2, this.perfCmjT3];
        cmjInputs.forEach(input => {
            if (input) {
                input.addEventListener('input', () => this.calculateCmjMetrics());
            }
        });

        // Dual Mode Assessments events
        if (this.assessmentTabIndividual) {
            this.assessmentTabIndividual.addEventListener('click', () => this.toggleAssessmentTab('individual'));
        }
        if (this.assessmentTabTeam) {
            this.assessmentTabTeam.addEventListener('click', () => this.toggleAssessmentTab('team'));
        }
        if (this.saveTeamPerfBtn) {
            this.saveTeamPerfBtn.addEventListener('click', () => this.saveTeamPerformance());
        }
        if (this.teamBulkFilterSelect) {
            this.teamBulkFilterSelect.addEventListener('change', () => this.renderTeamBulkSheet(false));
        }
        if (this.teamPerfLogDate) {
            this.teamPerfLogDate.addEventListener('change', () => this.renderTeamBulkSheet(false));
        }
        if (this.newTestForm) {
            this.newTestForm.addEventListener('submit', (e) => this.handleNewCustomTest(e));
        }
        if (this.teamBulkBody) {
            this.teamBulkBody.addEventListener('input', (e) => {
                if (e.target.classList.contains('team-trial-input')) {
                    const athleteId = e.target.getAttribute('data-athlete-id');
                    this.calculateTeamRowMetrics(athleteId);
                }
                if (e.target.classList.contains('team-e1rm-weight-input') || e.target.classList.contains('team-e1rm-reps-input')) {
                    const athleteId = e.target.getAttribute('data-athlete-id');
                    this.calculateTeamRowE1RM(athleteId);
                }
            });
        }

        // ── Reconditioning Events ────────────────────────────────────
        if (this.reconAthleteSelect) {
            this.reconAthleteSelect.addEventListener('change', () => this.loadReconCase());
        }
        if (this.reconInjuryDate) {
            this.reconInjuryDate.addEventListener('change', () => this.updateReconElapsedTimers());
        }
        if (this.reconSurgeryDate) {
            this.reconSurgeryDate.addEventListener('change', () => this.updateReconElapsedTimers());
        }
        if (this.reconSaveCaseBtn) {
            this.reconSaveCaseBtn.addEventListener('click', () => this.reconSaveCase());
        }
        if (this.reconDeleteCaseBtn) {
            this.reconDeleteCaseBtn.addEventListener('click', () => this.reconDeleteCase());
        }
        if (this.reconLogProgressBtn) {
            this.reconLogProgressBtn.addEventListener('click', () => this.reconLogProgress());
        }
        // Real-time LSI calculation on metric inputs
        const reconMetricInputs = [
            this.reconQuadInvolved, this.reconQuadUninvolved,
            this.reconHopLeft, this.reconHopRight,
            this.reconLateralLeft, this.reconLateralRight
        ];
        reconMetricInputs.forEach(input => {
            if (input) input.addEventListener('input', () => this.calculateReconLSI());
        });

        // Match Log Events
        if (this.saveMatchLogBtn) {
            this.saveMatchLogBtn.addEventListener('click', () => this.saveMatchLog());
        }

        // Weight Room Screen display date change event listener
        if (this.weightRoomDateSelect) {
            this.weightRoomDateSelect.addEventListener('change', () => {
                this.renderWeightRoomView();
            });
        }
        if (this.dashTrendTestSelect) {
            this.dashTrendTestSelect.addEventListener('change', () => {
                this.renderDashboardTrendChart();
            });
        }

        if (this.analyticsTestSelect) {
            this.analyticsTestSelect.addEventListener('change', () => {
                if (window.AnalyticsModule && typeof window.AnalyticsModule.renderAll === 'function') {
                    window.AnalyticsModule.renderAll();
                }
            });
        }
    },

    toggleMute() {
        this.isMuted = !this.isMuted;
        const bgm = document.getElementById('matrixBgm');
        const sfx = document.getElementById('glitchSfx');
        const muteIcon = this.bgmMuteBtn?.querySelector('i');
        const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
        const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
        
        if (bgm) {
            bgm.muted = this.isMuted;
            if (!this.isMuted) {
                if (this.bgmType === 'html5') {
                    try { bgm.play().catch(() => {}); } catch(e) {}
                }
            } else {
                if (this.bgmType === 'html5') {
                    bgm.pause();
                }
            }
        }

        if (window.ytPlayer && typeof window.ytPlayer.mute === 'function') {
            if (this.isMuted) {
                window.ytPlayer.mute();
                if (this.bgmType === 'youtube') {
                    window.ytPlayer.pauseVideo();
                }
            } else {
                window.ytPlayer.unMute();
                if (this.bgmType === 'youtube') {
                    window.ytPlayer.playVideo();
                }
            }
        }

        if (sfx) sfx.muted = this.isMuted;

        const muteClassName = this.isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        if (muteIcon) muteIcon.className = muteClassName;
        if (sidebarMuteIcon) sidebarMuteIcon.className = muteClassName;

        const heroBgmStatus = document.getElementById('hero-bgm-status');
        const sidebarBgmStatus = document.getElementById('sidebar-bgm-status');
        const statusText = this.isMuted ? 'MUTED' : 'PLAYING';
        const statusColor = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
        
        if (heroBgmStatus) {
            heroBgmStatus.textContent = statusText;
            heroBgmStatus.style.color = statusColor;
        }
        if (sidebarBgmStatus) {
            sidebarBgmStatus.textContent = statusText;
            sidebarBgmStatus.style.color = statusColor;
        }
    },

    toggleUserRole() {
        if (this.userRole === 'admin') {
            this.userRole = 'user';
            localStorage.setItem('atp_user_role', 'user');
            window.WellnessModule.showToast('Logged out to User Mode.', 'info');
            this.updateRoleUI();
        } else {
            const pass = prompt('Enter Admin Passcode:');
            if (pass === 'admin123') {
                this.userRole = 'admin';
                localStorage.setItem('atp_user_role', 'admin');
                window.WellnessModule.showToast('Logged in as Admin.', 'success');
                this.updateRoleUI();
            } else if (pass !== null) {
                window.WellnessModule.showToast('Incorrect Admin Passcode!', 'danger');
            }
        }
    },

    updateRoleUI() {
        const sidebarRoleText = document.getElementById('sidebar-role-text');
        const sidebarRoleBtn = document.getElementById('sidebar-role-btn');
        const heroRoleStatus = document.getElementById('hero-role-status');

        if (sidebarRoleText) {
            sidebarRoleText.textContent = this.userRole.toUpperCase();
        }

        if (sidebarRoleBtn) {
            const icon = sidebarRoleBtn.querySelector('i');
            if (icon) {
                icon.className = this.userRole === 'admin' ? 'fas fa-user-shield' : 'fas fa-user';
            }
            if (this.userRole === 'admin') {
                sidebarRoleBtn.style.color = 'var(--accent-orange)';
                sidebarRoleBtn.style.borderColor = 'var(--accent-orange)';
            } else {
                sidebarRoleBtn.style.color = 'var(--text-primary)';
                sidebarRoleBtn.style.borderColor = 'var(--border-color)';
            }
        }

        if (heroRoleStatus) {
            heroRoleStatus.textContent = this.userRole.toUpperCase();
            heroRoleStatus.style.color = this.userRole === 'admin' ? 'var(--accent-orange)' : 'var(--accent-blue)';
        }
    },

    checkAdminPermission() {
        if (this.userRole !== 'admin') {
            const confirmLogin = confirm('Access Denied: คุณต้องมีสิทธิ์ Admin ในการดำเนินการนี้ (Admin role required).\n\nต้องการกรอกรหัสผ่านเพื่อสลับเป็น Admin และทำงานต่อทันทีหรือไม่?');
            if (confirmLogin) {
                const pass = prompt('กรุณากรอกรหัสผ่าน Admin Passcode:');
                if (pass === 'admin123') {
                    this.userRole = 'admin';
                    localStorage.setItem('atp_user_role', 'admin');
                    window.WellnessModule.showToast('เข้าสู่ระบบในฐานะ Admin สำเร็จ!', 'success');
                    this.updateRoleUI();
                    return true;
                } else if (pass !== null) {
                    window.WellnessModule.showToast('รหัสผ่านไม่ถูกต้อง!', 'danger');
                }
            }
            return false;
        }
        return true;
    },

    toggleSidebar() {
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('collapsed');
            
            const isCollapsed = sidebar.classList.contains('collapsed');
            localStorage.setItem('atp_sidebar_collapsed', isCollapsed ? 'true' : 'false');
            
            const toggleBtn = document.getElementById('sidebar-toggle-btn');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    icon.className = isCollapsed ? 'fas fa-bars' : 'fas fa-chevron-left';
                }
            }
        }
    },

    initSidebarToggle() {
        const sidebarCollapsed = localStorage.getItem('atp_sidebar_collapsed') === 'true';
        const sidebar = document.querySelector('.sidebar');
        const toggleBtn = document.getElementById('sidebar-toggle-btn');
        
        if (sidebarCollapsed) {
            if (sidebar) sidebar.classList.add('collapsed');
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-bars';
            }
        } else {
            if (toggleBtn) {
                const icon = toggleBtn.querySelector('i');
                if (icon) icon.className = 'fas fa-chevron-left';
            }
        }
    },

    startMetronome() {
        if (this._metronomeInterval) clearInterval(this._metronomeInterval);
        
        const bpm = parseInt(this.metronomeBpm?.value) || 60;
        const intervalMs = (60 / bpm) * 1000;
        
        this._metronomeInterval = setInterval(() => {
            this.playMetronomeTick();
        }, intervalMs);
    },

    stopMetronome() {
        if (this._metronomeInterval) {
            clearInterval(this._metronomeInterval);
            this._metronomeInterval = null;
        }
    },

    getAudioContext() {
        if (!window.ATPAudioContext) {
            window.ATPAudioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (window.ATPAudioContext.state === 'suspended') {
            window.ATPAudioContext.resume();
        }
        return window.ATPAudioContext;
    },

    playMetronomeTick() {
        if (this.isMuted) return;

        try {
            const context = this.getAudioContext();
            const osc = context.createOscillator();
            const gain = context.createGain();

            osc.connect(gain);
            gain.connect(context.destination);

            osc.frequency.setValueAtTime(1000, context.currentTime); // 1000Hz transient click signal
            gain.gain.setValueAtTime(1, context.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.08); // fading to 0.001 within 0.08s

            osc.start(context.currentTime);
            osc.stop(context.currentTime + 0.09);
        } catch (e) {
            console.error('Audio Metronome failed:', e);
        }
    },

    initTheme() {
        const savedTheme = localStorage.getItem('atp_theme') || 'dark';
        document.body.setAttribute('data-theme', savedTheme);
        this.updateThemeButtonUI(savedTheme);
        this.matrixMediaSync(savedTheme);
    },

    toggleTheme() {
        const currentTheme = document.body.getAttribute('data-theme') || 'dark';
        let newTheme;
        if (currentTheme === 'dark')        newTheme = 'light';
        else if (currentTheme === 'light')  newTheme = 'matrix';
        else if (currentTheme === 'matrix') newTheme = 'noir';
        else                                newTheme = 'dark';
        document.body.setAttribute('data-theme', newTheme);
        localStorage.setItem('atp_theme', newTheme);
        this.updateThemeButtonUI(newTheme);
        this.matrixMediaSync(newTheme);

        // Fire violent glitch intro when entering Matrix
        if (newTheme === 'matrix') {
            this.fireGlitchIntro();
        }

        // Re-render the active view if it depends on JS-based theme variables/charts
        const activeViewEl = Array.from(this.views).find(view => view.classList.contains('active'));
        if (activeViewEl) {
            const activeViewId = activeViewEl.id.replace('-view', '');
            if (activeViewId === 'analytics') {
                window.AnalyticsModule.renderAll();
            } else if (activeViewId === 'weight-room') {
                this.renderWeightRoomView();
            } else if (activeViewId === 'dashboard') {
                this.updateDashboard();
            }
        }
    },

    setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('atp_theme', theme);
        this.updateThemeButtonUI(theme);
        this.matrixMediaSync(theme);
    },

    updateThemeButtonUI(theme) {
        if (!this.themeToggleBtn) return;
        if (theme === 'light') {
            this.themeToggleBtn.querySelector('i').className = 'fas fa-tint';
            this.themeBtnText.textContent = 'Blue Mode';
        } else if (theme === 'matrix') {
            this.themeToggleBtn.querySelector('i').className = 'fas fa-terminal';
            this.themeBtnText.textContent = 'Matrix Mode';
        } else if (theme === 'noir') {
            this.themeToggleBtn.querySelector('i').className = 'fas fa-user-secret';
            this.themeBtnText.textContent = 'Noir Mode';
        } else {
            this.themeToggleBtn.querySelector('i').className = 'fas fa-moon';
            this.themeBtnText.textContent = 'Dark Mode';
        }
    },

    matrixMediaSync(theme) {
        const gifOverlay = document.getElementById('matrix-gif-overlay');
        const statusText = document.getElementById('sidebar-bgm-status');
        const heroStatusText = document.getElementById('hero-bgm-status');

        if (theme === 'matrix') {
            this.bgmType = 'youtube';
            this.isPlaylistActive = false;

            if (window.ytPlayer && this.isYtPlayerReady) {
                if (this.currentYtVideoId !== 'G70S5fumHso') {
                    if (typeof window.ytPlayer.loadVideoById === 'function') {
                        window.ytPlayer.loadVideoById({
                            videoId: 'G70S5fumHso',
                            startSeconds: 21
                        });
                        this.currentYtVideoId = 'G70S5fumHso';
                    }
                }
                
                if (this.isMuted) {
                    if (typeof window.ytPlayer.mute === 'function') window.ytPlayer.mute();
                    if (typeof window.ytPlayer.pauseVideo === 'function') window.ytPlayer.pauseVideo();
                } else {
                    if (typeof window.ytPlayer.unMute === 'function') window.ytPlayer.unMute();
                    if (typeof window.ytPlayer.playVideo === 'function') window.ytPlayer.playVideo();
                }
                
                if (statusText) {
                    statusText.textContent = 'Matrix Theme';
                    statusText.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
                }
            } else {
                this.pendingYtAction = { type: 'video', id: 'G70S5fumHso', startSeconds: 21 };
                this.currentYtVideoId = 'G70S5fumHso';
                initYoutubePlayer();
                if (statusText) {
                    statusText.textContent = 'Loading YT...';
                    statusText.style.color = 'var(--accent-orange)';
                }
            }

            if (heroStatusText) {
                heroStatusText.textContent = this.isMuted ? 'MUTED' : 'PLAYING';
                heroStatusText.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
            }

            // Fade in GIF overlay
            if (gifOverlay) {
                gifOverlay.style.display = 'block';
                requestAnimationFrame(() => {
                    gifOverlay.style.opacity = '0.12';
                });
            }
        } else {
            // Pause BGM if it is playing
            this.pauseBgm();

            // Hide GIF overlay
            if (gifOverlay) {
                gifOverlay.style.opacity = '0';
                setTimeout(() => { gifOverlay.style.display = 'none'; }, 350);
            }
            // Clean up glitch state classes
            document.body.classList.remove('violent-glitch-active', 'matrix-stabilized');
        }
    },

    fireGlitchIntro() {
        // Play glitch SFX
        const sfx = document.getElementById('glitchSfx');
        if (sfx) {
            sfx.currentTime = 0;
            sfx.volume = 0.6;
            sfx.muted = this.isMuted;
            try { sfx.play().catch(() => {}); } catch(e) {}
        }

        // Violent glitch class — 1.5s brutal RGB split
        document.body.classList.add('violent-glitch-active');

        setTimeout(() => {
            document.body.classList.remove('violent-glitch-active');
            // Settle into slow organic micro-twitch
            document.body.classList.add('matrix-stabilized');
        }, 1500);
    },

    populateAthleteSelect() {
        if (!this.globalAthleteSelect) return;
        const athletes = window.Store.getAthletes();
        this.globalAthleteSelect.innerHTML = '';
        if (athletes.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No Athletes';
            this.globalAthleteSelect.appendChild(opt);
            return;
        }
        athletes.forEach(ath => {
            const opt = document.createElement('option');
            opt.value = ath.id;
            opt.textContent = this.getAthleteDisplayName(ath);
            this.globalAthleteSelect.appendChild(opt);
        });
    },

    triggerInitialPrNotification() {
        const athlete = window.Store.getAthleteById(this.currentAthleteId);
        if (athlete && athlete.performanceLogs && athlete.performanceLogs.length > 0) {
            const sortedLogs = [...athlete.performanceLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
            const latestLog = sortedLogs[sortedLogs.length - 1];
            const todayStr = window.Store.getLocalDateString();
            if (latestLog.date === todayStr) {
                const historicalCmj = sortedLogs.slice(0, -1).map(l => l.cmj).filter(val => val != null);
                const historicalRsi = sortedLogs.slice(0, -1).map(l => l.rsi).filter(val => val != null);
                const isCmjPR = latestLog.cmj != null && (historicalCmj.length === 0 || latestLog.cmj > Math.max(...historicalCmj));
                const isRsiPR = latestLog.rsi != null && (historicalRsi.length === 0 || latestLog.rsi > Math.max(...historicalRsi));
                
                if (isCmjPR || isRsiPR) {
                    let prMsg = '';
                    if (isCmjPR) prMsg += `CMJ: ${latestLog.cmj}cm (PB!) `;
                    if (isRsiPR) prMsg += `RSI: ${latestLog.rsi.toFixed(2)} (PB!) `;
                    setTimeout(() => {
                        window.WellnessModule.showToast(`🔥 NEW PERSONAL RECORD! ${prMsg}`, 'success');
                    }, 1000);
                }
            }
        }
    },

    handleAthleteSwitch() {
        this.updateDashboard();
        window.WorkoutModule.loadWorkoutList();
        window.WorkoutModule.createNewWorkout();
        if (window.WellnessModule.currentDate) {
            window.WellnessModule.loadDateData(window.WellnessModule.currentDate);
        }
        window.AnalyticsModule.renderAll();
        window.PeriodizationModule.refresh();
        if (document.getElementById('roster-view').classList.contains('active')) {
            if (this.currentAthleteId) {
                this.loadAthleteIntoRosterForm(this.currentAthleteId);
            } else {
                this.clearRosterForm();
            }
            this.renderRosterList();
        } else if (document.getElementById('assessment-view').classList.contains('active')) {
            if (this.assessmentTabTeam && this.assessmentTabTeam.classList.contains('active')) {
                this.renderTeamBulkSheet();
            } else {
                this.renderPerformanceHistory(this.currentAthleteId);
                this.loadIndividualAssessmentForDate();
            }
        } else if (document.getElementById('reconditioning-view').classList.contains('active')) {
            if (this.reconAthleteSelect) {
                this.reconAthleteSelect.value = this.currentAthleteId || '';
            }
            this.loadReconCase();
        }

        // Trigger PR Toast notification if the latest entry is today and is a PB
        const athlete = window.Store.getAthleteById(this.currentAthleteId);
        if (athlete && athlete.performanceLogs && athlete.performanceLogs.length > 0) {
            const sortedLogs = [...athlete.performanceLogs].sort((a, b) => new Date(a.date) - new Date(b.date));
            const latestLog = sortedLogs[sortedLogs.length - 1];
            const todayStr = window.Store.getLocalDateString();
            if (latestLog.date === todayStr) {
                const historicalCmj = sortedLogs.slice(0, -1).map(l => l.cmj).filter(val => val != null);
                const historicalRsi = sortedLogs.slice(0, -1).map(l => l.rsi).filter(val => val != null);
                const isCmjPR = latestLog.cmj != null && (historicalCmj.length === 0 || latestLog.cmj > Math.max(...historicalCmj));
                const isRsiPR = latestLog.rsi != null && (historicalRsi.length === 0 || latestLog.rsi > Math.max(...historicalRsi));
                
                if (isCmjPR || isRsiPR) {
                    let prMsg = '';
                    if (isCmjPR) prMsg += `CMJ: ${latestLog.cmj}cm (PB!) `;
                    if (isRsiPR) prMsg += `RSI: ${latestLog.rsi.toFixed(2)} (PB!) `;
                    setTimeout(() => {
                        window.WellnessModule.showToast(`🔥 NEW PERSONAL RECORD! ${prMsg}`, 'success');
                    }, 500);
                }
            }
        }
    },

    clearRosterForm() {
        this.stopWebcam();
        this.athleteFullname.value = '';
        this.athleteNickname.value = '';
        this.athleteDob.value = '';
        this.athleteAgeCalc.value = '0';
        this.athleteTeam.value = '';
        this.avatarImgLg.style.display = 'none';
        this.avatarInitialsLg.textContent = '?';
        this.avatarInitialsLg.style.display = 'block';
        
        // Also refresh checkboxes in assignment and attendance lists
        if (window.WorkoutModule && window.WorkoutModule.renderRosterAssignment) {
            window.WorkoutModule.renderRosterAssignment();
        }
        if (this.renderMatchLogAttendance) {
            this.renderMatchLogAttendance();
        }
    },

    switchView(viewId) {
        this.stopWebcam();
        if (viewId === 'hero-gate') {
            this.returnToHeroGate();
            return;
        }

        this.navItems.forEach(item => {
            item.classList.toggle('active', item.getAttribute('data-view') === viewId);
        });
        this.views.forEach(view => {
            view.classList.toggle('active', view.id === `${viewId}-view`);
        });

        if (viewId === 'team-management') this.renderTeamManagementView();
        else if (viewId === 'dashboard') this.updateDashboard();
        else if (viewId === 'analytics') window.AnalyticsModule.renderAll();
        else if (viewId === 'workout') window.WorkoutModule.populateExerciseSelect();
        else if (viewId === 'roster') {
            this.renderRosterList();
            if (this.currentAthleteId) this.loadAthleteIntoRosterForm(this.currentAthleteId);
        } else if (viewId === 'assessment') {
            if (this.assessmentTabTeam && this.assessmentTabTeam.classList.contains('active')) {
                this.renderTeamBulkSheet();
            } else {
                if (this.perfLogDate && !this.perfLogDate.value) {
                    this.perfLogDate.value = window.Store.getLocalDateString();
                }
                this.renderPerformanceHistory(this.currentAthleteId);
                this.updateIndividualFormVisibility();
                this.loadIndividualAssessmentForDate();
            }
        } else if (viewId === 'periodization') window.PeriodizationModule.refresh();
        else if (viewId === 'reconditioning') this.initReconView();
        else if (viewId === 'match-log') this.initMatchLogView();
        else if (viewId === 'live-tracker') { if (window.LiveTrackerModule) window.LiveTrackerModule.init(); else this.initLiveTrackerView(); }
        else if (viewId === 'weight-room') this.renderWeightRoomView();
        else if (viewId === 'test-manager') this.renderTestManagerList();
    },

    renderTeamManagementView() {
        const athletes = window.Store.getAthletesOnly();
        const rosterCountEl = document.getElementById('team-mgmt-roster-count');
        const availValEl = document.getElementById('team-mgmt-availability-val');
        const availSubEl = document.getElementById('team-mgmt-availability-sub');
        const rehabCountEl = document.getElementById('team-mgmt-rehab-count');
        const matchesCountEl = document.getElementById('team-mgmt-matches-count');

        if (rosterCountEl) rosterCountEl.textContent = `${athletes.length} Players`;

        // Active Rehab Cases
        const reconCases = JSON.parse(localStorage.getItem('personal_ams_recon_cases')) || [];
        const activeRehabCount = reconCases.filter(c => c.status === 'Active' || c.status === 'In Progress').length;
        if (rehabCountEl) rehabCountEl.textContent = `${activeRehabCount} Cases`;

        // Squad Availability Rate
        const totalAthletes = athletes.length;
        const availableCount = Math.max(0, totalAthletes - activeRehabCount);
        const availRate = totalAthletes > 0 ? Math.round((availableCount / totalAthletes) * 100) : 100;
        if (availValEl) availValEl.textContent = `${availRate}%`;
        if (availSubEl) availSubEl.textContent = `${availableCount} Fit / ${activeRehabCount} Out`;

        // Recorded Matches
        const playedLogs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        if (matchesCountEl) matchesCountEl.textContent = `${playedLogs.length} Games`;

        // Render Position Depth Chart (PG, SG, SF, PF, C, Unassigned)
        const depthGrid = document.getElementById('team-mgmt-depth-chart-grid');
        if (depthGrid) {
            depthGrid.innerHTML = '';
            const positions = ['PG', 'SG', 'SF', 'PF', 'C', 'Unassigned'];
            
            positions.forEach(pos => {
                const posAthletes = athletes.filter(a => {
                    const p = (a.position || '').toUpperCase();
                    if (pos === 'Unassigned') return !p || !['PG', 'SG', 'SF', 'PF', 'C'].includes(p);
                    return p === pos;
                });
                const col = document.createElement('div');
                col.className = 'glass-panel';
                col.style = `padding: 12px; border-top: 3px solid ${pos === 'Unassigned' ? 'var(--text-muted)' : 'var(--accent-orange)'}; border-radius: 6px; background: rgba(255,255,255,0.02);`;
                
                let listHtml = '';
                if (posAthletes.length === 0) {
                    listHtml = '<div style="color: var(--text-muted); font-size: 0.75rem; font-style: italic; margin-top: 8px;">None</div>';
                } else {
                    posAthletes.forEach(ath => {
                        listHtml += `
                            <div onclick="window.App.selectAthlete('${ath.id}'); window.App.switchView('roster');" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" title="Click to view/edit athlete profile">
                                <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                    ${ath.nickname || ath.fullName}
                                </span>
                                <span style="font-size: 0.72rem; color: var(--accent-blue); font-weight: bold; font-family: monospace;">
                                    ${ath.jerseyNumber ? `#${ath.jerseyNumber}` : '-'}
                                </span>
                            </div>
                        `;
                    });
                }

                col.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; font-size: 0.85rem; color: ${pos === 'Unassigned' ? 'var(--text-muted)' : 'var(--accent-orange)'};">${pos}</span>
                        <span style="background: rgba(255,255,255,0.1); color: var(--text-muted); padding: 1px 6px; border-radius: 10px; font-size: 0.68rem; font-weight: bold;">${posAthletes.length}</span>
                    </div>
                    ${listHtml}
                `;
                depthGrid.appendChild(col);
            });
        }

        // Render Roster Management Table
        const tableBody = document.getElementById('team-mgmt-roster-table-body');
        if (tableBody) {
            tableBody.innerHTML = '';
            if (athletes.length === 0) {
                tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 16px;">No athletes in MPS Roster yet.</td></tr>';
                return;
            }

            athletes.forEach(ath => {
                const logs = window.Store ? window.Store.getWellnessLogs(ath.id) : [];
                const readiness = logs.length > 0 ? (logs[0].totalScore || logs[0].score || 85) : 85;
                let statusBadge = `<span style="background: rgba(16, 185, 129, 0.2); color: #10B981; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">READY</span>`;
                
                // Check if in rehab
                const isRehab = reconCases.some(c => c.athleteId === ath.id && (c.status === 'Active' || c.status === 'In Progress'));
                if (isRehab) {
                    statusBadge = `<span style="background: rgba(239, 68, 68, 0.2); color: #EF4444; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">INJURED / REHAB</span>`;
                }

                const photoUrl = ath.photo || ath.photoData || null;
                let photoHtml = photoUrl
                    ? `<img src="${photoUrl}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--accent-blue);">`
                    : `<div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-orange), var(--accent-red)); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem; color: #fff;">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'A')}</div>`;

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                tr.innerHTML = `
                    <td style="padding: 10px; display: flex; align-items: center; gap: 10px;">
                        ${photoHtml}
                        <strong style="color: var(--text-primary);">${ath.fullName} ${ath.nickname ? `(${ath.nickname})` : ''}</strong>
                    </td>
                    <td style="padding: 10px; color: var(--accent-blue); font-weight: bold;">${ath.jerseyNumber ? `#${ath.jerseyNumber}` : '-'}</td>
                    <td style="padding: 10px;">${ath.position || 'Unassigned'}</td>
                    <td style="padding: 10px;">${statusBadge}</td>
                    <td style="padding: 10px; font-weight: bold; color: ${readiness >= 80 ? '#10B981' : (readiness >= 70 ? '#F59E0B' : '#EF4444')};">${readiness}%</td>
                    <td style="padding: 10px; text-align: right;">
                        <button class="btn btn-secondary btn-xs" onclick="window.App.selectAthlete('${ath.id}'); window.App.switchView('roster');">Edit Profile</button>
                    </td>
                `;
                tableBody.appendChild(tr);
            });
        }
    },

    updateDashboard() {
        const todayStr = window.Store.getLocalDateString();
        const athlete = window.Store.getAthleteById(this.currentAthleteId);

        // สุ่มคำคมขึ้นแบนเนอร์
        if (this.quoteText) {
            const quotesSource = window.MOTIVATIONAL_QUOTES || [{ text: "Keep moving forward.", author: "Coach Ponrawee" }];
            const randomQuote = quotesSource[Math.floor(Math.random() * quotesSource.length)];
            this.quoteText.textContent = `"${randomQuote.text}"`;
            this.quoteAuthor.textContent = `— ${randomQuote.author}`;
        }

        if (!athlete) {
            this.sidebarUserName.textContent = 'No Athlete';
            this.sidebarUserTeam.textContent = 'Add or select an athlete';
            this.sidebarUserAvatar.textContent = '?';
            this.sidebarUserAvatar.style.background = 'var(--text-muted)';
            
            if (this.dashReadinessNum) this.dashReadinessNum.textContent = '--%';
            if (this.dashReadinessSub) {
                this.dashReadinessSub.textContent = 'No athlete selected';
                this.dashReadinessSub.style.color = 'var(--text-muted)';
            }
            this.updateReadinessRing(0);
            if (this.dashVolumeNum) this.dashVolumeNum.textContent = '0 kg';
            if (this.dashWorkoutsNum) this.dashWorkoutsNum.textContent = '0';
            if (this.dashPrsNum) this.dashPrsNum.textContent = '0';
            if (this.dashHistoryTable) {
                this.dashHistoryTable.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No athlete selected</td></tr>';
            }
            if (this.cnsFatigueBadge) {
                this.cnsFatigueBadge.innerHTML = '';
            }
            if (this.dashTrendTestSelect) this.dashTrendTestSelect.innerHTML = '';
            this.renderDashboardTrendChart();
            this.renderDashboardMatches();
            return;
        }

        const workouts = window.Store.getWorkouts(this.currentAthleteId);
        const prs = window.Store.getPersonalRecords(this.currentAthleteId);

        this.sidebarUserName.textContent = athlete.fullName;
        this.sidebarUserTeam.textContent = athlete.team || 'Unattached';
        if (athlete.photo) {
            this.sidebarUserAvatar.innerHTML = `<img src="${athlete.photo}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;">`;
            this.sidebarUserAvatar.style.background = 'none';
        } else {
            this.sidebarUserAvatar.textContent = this.getInitials(athlete.fullName);
            this.sidebarUserAvatar.style.background = 'linear-gradient(135deg, var(--accent-orange), var(--accent-red))';
        }

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        if (this.dashWorkoutsNum) {
            this.dashWorkoutsNum.textContent = workouts.filter(w => new Date(w.date) >= sevenDaysAgo).length;
        }
        if (this.dashVolumeNum) {
            let weeklyVolume = 0;
            workouts.forEach(w => {
                if (new Date(w.date) >= sevenDaysAgo) weeklyVolume += window.Store.calculateTotalVolume(w);
            });
            this.dashVolumeNum.textContent = `${weeklyVolume.toLocaleString()} kg`;
        }
        if (this.dashPrsNum) {
            this.dashPrsNum.textContent = Object.keys(prs).length;
        }

        // Update Team Level Overview KPIs
        const athletes = window.Store.getAthletesOnly();
        const rosterValEl = document.getElementById('dash-team-roster-val');
        const rosterSubEl = document.getElementById('dash-team-roster-sub');
        if (rosterValEl) rosterValEl.textContent = `${athletes.length} Players`;
        if (rosterSubEl) rosterSubEl.textContent = `Active MPS Squad Members`;

        // Calculate Average Team Readiness Today
        let totalReadiness = 0;
        let loggedCount = 0;
        athletes.forEach(a => {
            const logs = window.Store ? window.Store.getWellnessLogs(a.id) : [];
            if (logs && logs.length > 0) {
                totalReadiness += (logs[0].totalScore || logs[0].score || 80);
                loggedCount++;
            }
        });
        const avgReadiness = loggedCount > 0 ? Math.round(totalReadiness / loggedCount) : 85;
        const readinessValEl = document.getElementById('dash-team-readiness-val');
        const readinessSubEl = document.getElementById('dash-team-readiness-sub');
        if (readinessValEl) readinessValEl.textContent = `${avgReadiness}%`;
        if (readinessSubEl) readinessSubEl.textContent = loggedCount > 0 ? `Avg Readiness (${loggedCount}/${athletes.length} Logged Today)` : 'Average Readiness Across MPS Roster';

        // Render Team Roster Grid
        this.renderTeamRosterGrid();

        // Populate assessment trend test selector
        if (this.dashTrendTestSelect) {
            const currentSelected = this.dashTrendTestSelect.value;
            const tests = window.Store.getTests();
            this.dashTrendTestSelect.innerHTML = '';
            
            tests.forEach(t => {
                const opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.name;
                this.dashTrendTestSelect.appendChild(opt);
            });
            
            if (currentSelected && tests.some(t => t.id === currentSelected)) {
                this.dashTrendTestSelect.value = currentSelected;
            } else if (tests.length > 0) {
                this.dashTrendTestSelect.value = tests[0].id;
            }
        }

        // Render Trend Chart & Match lists
        this.renderDashboardTrendChart();
        this.renderDashboardMatches();

        if (this.dashHistoryTable) {
            const recentWorkouts = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);
            if (recentWorkouts.length === 0) {
                this.dashHistoryTable.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">No workout history found</td></tr>';
                return;
            }
            this.dashHistoryTable.innerHTML = '';
            recentWorkouts.forEach(w => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="padding: 12px 6px;">${w.date}</td>
                    <td style="padding: 12px 6px; font-weight: 500;">${w.name}</td>
                    <td style="padding: 12px 6px; color: var(--accent-blue); font-weight: 600;">${window.Store.calculateTotalVolume(w).toLocaleString()} kg</td>
                    <td style="padding: 12px 6px; text-align: right;"><button class="btn btn-secondary btn-sm" onclick="window.App.switchView('workout'); window.WorkoutModule.loadWorkout('${w.id}');">View</button></td>
                `;
                this.dashHistoryTable.appendChild(tr);
            });
        }
    },

    renderTeamRosterGrid() {
        const grid = document.getElementById('dash-team-roster-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const athletes = window.Store.getAthletesOnly();
        if (athletes.length === 0) {
            grid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem;">No athletes in MPS Roster yet.</div>';
            return;
        }

        athletes.forEach(ath => {
            const isSelected = ath.id === this.currentAthleteId;
            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style = `padding: 14px; border-radius: 8px; border-left: 4px solid ${isSelected ? 'var(--accent-orange)' : 'var(--accent-blue)'}; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; background: ${isSelected ? 'rgba(234, 58, 42, 0.08)' : 'rgba(255,255,255,0.02)'};`;
            card.onclick = () => {
                this.selectAthlete(ath.id);
                this.switchView('roster');
                window.WellnessModule.showToast(`Selected ${ath.nickname || ath.fullName}`, 'info');
            };

            let photoHtml = `<div style="width: 44px; height: 44px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-orange), var(--accent-red)); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1rem; color: #fff; flex-shrink: 0;">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'A')}</div>`;
            if (ath.photoData) {
                photoHtml = `<img src="${ath.photoData}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 2px solid var(--accent-blue); flex-shrink: 0;">`;
            }

            // Get Wellness score
            const history = window.Store ? window.Store.getWellnessLogs(ath.id) : [];
            const readiness = history.length > 0 ? (history[0].totalScore || history[0].score || 85) : 85;
            let statusBadge = `<span style="background: rgba(16, 185, 129, 0.2); color: #10B981; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: bold;">${readiness}% READY</span>`;
            if (readiness < 70) {
                statusBadge = `<span style="background: rgba(239, 68, 68, 0.2); color: #EF4444; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: bold;">${readiness}% FATIGUED</span>`;
            } else if (readiness < 80) {
                statusBadge = `<span style="background: rgba(245, 158, 11, 0.2); color: #F59E0B; padding: 2px 6px; border-radius: 4px; font-size: 0.68rem; font-weight: bold;">${readiness}% MODERATE</span>`;
            }

            card.innerHTML = `
                <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 10px;">
                    ${photoHtml}
                    <div style="min-width: 0; flex-grow: 1;">
                        <div style="font-weight: bold; font-size: 0.9rem; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                            ${this.getAthleteDisplayName(ath)}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">
                            Jersey: <strong style="color: var(--accent-blue);">#${ath.jerseyNumber || ath.id.slice(-2)}</strong> | ${ath.position || 'Athlete'}
                        </div>
                    </div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.72rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 8px;">
                    <span style="color: var(--text-muted);">Readiness:</span>
                    ${statusBadge}
                </div>
            `;
            grid.appendChild(card);
        });
    },

    dashTrendChart: null,
    
    renderDashboardTrendChart() {
        if (!this.dashTrendChartCanvas || !this.dashTrendTestSelect) return;
        
        if (this.dashTrendChart) {
            this.dashTrendChart.destroy();
            this.dashTrendChart = null;
        }
        
        const testId = this.dashTrendTestSelect.value;
        if (!testId) {
            this.dashTrendChartCanvas.style.display = 'none';
            if (this.dashTrendPlaceholder) this.dashTrendPlaceholder.style.display = 'flex';
            return;
        }
        
        const athlete = window.Store.getAthleteById(this.currentAthleteId);
        if (!athlete || !athlete.performanceLogs || athlete.performanceLogs.length === 0) {
            this.dashTrendChartCanvas.style.display = 'none';
            if (this.dashTrendPlaceholder) this.dashTrendPlaceholder.style.display = 'flex';
            return;
        }
        
        const logsWithData = athlete.performanceLogs
            .filter(log => {
                if (testId === 'weight') return log.athleteWeight !== undefined && log.athleteWeight !== null;
                return log[testId] !== undefined && log[testId] !== null;
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date));
            
        if (logsWithData.length === 0) {
            this.dashTrendChartCanvas.style.display = 'none';
            if (this.dashTrendPlaceholder) this.dashTrendPlaceholder.style.display = 'flex';
            return;
        }
        
        this.dashTrendChartCanvas.style.display = 'block';
        if (this.dashTrendPlaceholder) this.dashTrendPlaceholder.style.display = 'none';
        
        const labels = logsWithData.map(log => log.date);
        const data = logsWithData.map(log => {
            if (testId === 'weight') return log.athleteWeight;
            return log[testId];
        });
        
        const computedStyle = getComputedStyle(document.body);
        const accentColor = computedStyle.getPropertyValue('--accent-blue').trim() || '#ea3a2a';
        const accentRgb = computedStyle.getPropertyValue('--accent-blue-rgb').trim() || '234, 58, 42';
        const textPrimary = computedStyle.getPropertyValue('--text-primary').trim() || '#ffffff';
        const textSecondary = computedStyle.getPropertyValue('--text-secondary').trim() || '#a1a1aa';
        const borderColor = computedStyle.getPropertyValue('--border-color').trim() || 'rgba(255, 255, 255, 0.08)';
        
        const ctx = this.dashTrendChartCanvas.getContext('2d');
        const testObj = window.Store.getTests().find(t => t.id === testId);
        const testName = testObj ? testObj.name : testId;
        const unit = testObj && testObj.unit ? ` (${testObj.unit})` : '';

        this.dashTrendChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${testName}${unit}`,
                    data: data,
                    borderColor: accentColor,
                    backgroundColor: `rgba(${accentRgb}, 0.05)`,
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
    },

    renderDashboardMatches() {
        if (!this.dashUpcomingTournaments || !this.dashRecentMatches) return;
        
        const athleteId = this.currentAthleteId;
        if (!athleteId) {
            this.dashUpcomingTournaments.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No athlete selected.</div>';
            this.dashRecentMatches.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No athlete selected.</div>';
            return;
        }

        // Update KPI Card: UPCOMING TOURNAMENT / NEXT MATCH dynamically
        const nextValEl = document.getElementById('dash-next-tournament-val');
        const nextSubEl = document.getElementById('dash-next-tournament-sub');
        const periodizationMatches = JSON.parse(localStorage.getItem('personal_ams_periodization_matches')) || [];
        const todayStr = new Date().toISOString().slice(0, 10);
        const upcomingList = periodizationMatches
            .filter(m => m.date >= todayStr)
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (nextValEl && nextSubEl) {
            if (upcomingList.length > 0) {
                const nextMatch = upcomingList[0];
                nextValEl.textContent = `${nextMatch.tournamentName || nextMatch.opponent || 'Scheduled Match'}`;
                nextSubEl.textContent = `${nextMatch.date} vs ${nextMatch.opponent || 'Opponent'}`;
            } else {
                nextValEl.textContent = 'No Scheduled Tournament';
                nextSubEl.textContent = 'Add matches in Match Log module';
            }
        }

        // 1. Upcoming Tournaments
        const allTournaments = window.Store.getMatches ? window.Store.getMatches() : [];
        const myTournaments = allTournaments
            .filter(t => !athleteId || (t.athleteIds && t.athleteIds.includes(athleteId)))
            .sort((a, b) => new Date(a.date) - new Date(b.date));

        if (myTournaments.length === 0) {
            this.dashUpcomingTournaments.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No upcoming tournaments logged.</div>';
        } else {
            this.dashUpcomingTournaments.innerHTML = '';
            myTournaments.forEach(t => {
                const item = document.createElement('div');
                item.className = 'glass-panel';
                item.style.padding = '12px';
                item.style.borderLeft = '3px solid var(--accent-orange)';
                item.style.fontSize = '0.82rem';
                item.style.background = 'rgba(255, 255, 255, 0.01)';
                
                const formattedDate = new Date(t.date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                
                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div style="font-weight: bold; color: var(--text-primary);">${t.name}</div>
                        <span style="font-size: 0.68rem; padding: 1px 6px; border-radius: 4px; ${t.status === 'COMPLETED' ? 'background: rgba(16, 185, 129, 0.2); color: #10B981;' : 'background: rgba(245, 158, 11, 0.2); color: #F59E0B;'}">${t.status === 'COMPLETED' ? '✓ COMPLETED' : '📅 SCHEDULED'}</span>
                    </div>
                    <div style="color: var(--text-muted); margin-top: 4px;">
                        <i class="fas fa-calendar-alt"></i> ${formattedDate} • <i class="fas fa-map-marker-alt"></i> ${t.venue || 'N/A'}
                    </div>
                    ${t.notes ? `<div style="color: var(--text-muted); font-style: italic; margin-top: 4px; font-size: 0.75rem;">Note: ${t.notes}</div>` : ''}
                    <button type="button" onclick="window.App.launchLiveTrackerForMatch('${t.id}')" class="btn btn-secondary btn-sm" style="margin-top: 8px; font-size: 0.72rem; padding: 3px 8px; background: rgba(0, 144, 255, 0.15); border-color: rgba(0, 144, 255, 0.4); color: var(--accent-blue);">
                        <i class="fas fa-play-circle" style="color: var(--accent-blue);"></i> 🏀 Launch Live Stat Tracker
                    </button>
                `;
                this.dashUpcomingTournaments.appendChild(item);
            });
        }

        // 2. Recent Played Matches
        const allPlayedLogs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const myPlayedLogs = allPlayedLogs
            .filter(log => log.attendedAthleteIds && log.attendedAthleteIds.includes(athleteId))
            .sort((a, b) => new Date(b.date) - new Date(a.date));

        if (myPlayedLogs.length === 0) {
            this.dashRecentMatches.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 0.85rem; padding: 20px 0;">No match history found.</div>';
        } else {
            this.dashRecentMatches.innerHTML = '';
            myPlayedLogs.forEach(log => {
                const item = document.createElement('div');
                item.className = 'glass-panel';
                item.style.padding = '12px';
                item.style.fontSize = '0.82rem';
                item.style.background = 'rgba(255, 255, 255, 0.01)';
                
                let resultBadge = '';
                if (log.atpScore > log.oppScore) {
                    resultBadge = '<span class="match-result-win" style="font-size: 0.7rem; padding: 2px 6px;">WIN</span>';
                    item.style.borderLeft = '3px solid var(--accent-green)';
                } else if (log.atpScore < log.oppScore) {
                    resultBadge = '<span class="match-result-loss" style="font-size: 0.7rem; padding: 2px 6px;">LOSS</span>';
                    item.style.borderLeft = '3px solid var(--accent-red)';
                } else {
                    resultBadge = '<span class="match-result-draw" style="font-size: 0.7rem; padding: 2px 6px;">DRAW</span>';
                    item.style.borderLeft = '3px solid var(--text-muted)';
                }

                let dateRangeStr = '';
                const formatSingleDate = (dStr) => {
                    try {
                        return new Date(dStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
                    } catch(e) {
                        return dStr;
                    }
                };
                const formattedStartDate = formatSingleDate(log.date);
                if (log.endDate && log.endDate !== log.date) {
                    const formattedEndDate = formatSingleDate(log.endDate);
                    dateRangeStr = `${formattedStartDate} - ${formattedEndDate}`;
                } else {
                    dateRangeStr = formattedStartDate;
                }

                item.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: bold; color: var(--text-primary);">${log.title}</span>
                        ${resultBadge}
                    </div>
                    <div style="color: var(--text-muted); margin-top: 4px;">
                        vs <span style="color: var(--accent-orange); font-weight: 500;">${log.opponent}</span> • ${dateRangeStr}
                    </div>
                    <div style="font-weight: bold; color: var(--accent-blue); font-size: 0.9rem; margin-top: 4px; font-family: monospace;">
                        Score: ${log.atpScore} - ${log.oppScore}
                    </div>
                `;
                this.dashRecentMatches.appendChild(item);
            });
        }
    },

    currentAnalyticsTab: 'assess',
    
    switchAnalyticsTab(tabId) {
        this.currentAnalyticsTab = tabId;
        
        const panels = {
            assess: document.getElementById('analytics-panel-assess'),
            workload: document.getElementById('analytics-panel-workload'),
            pr: document.getElementById('analytics-panel-pr')
        };
        
        const buttons = {
            assess: document.getElementById('analytics-tab-assess-btn'),
            workload: document.getElementById('analytics-tab-workload-btn'),
            pr: document.getElementById('analytics-tab-pr-btn')
        };
        
        Object.keys(panels).forEach(key => {
            if (panels[key]) panels[key].style.display = (key === tabId) ? 'block' : 'none';
            if (buttons[key]) {
                if (key === tabId) {
                    buttons[key].classList.add('active');
                } else {
                    buttons[key].classList.remove('active');
                }
            }
        });
        
        if (window.AnalyticsModule && typeof window.AnalyticsModule.renderAll === 'function') {
            window.AnalyticsModule.renderAll();
        }
    },

    currentAnalyticsMode: 'individual',
    
    setAnalyticsMode(modeId) {
        this.currentAnalyticsMode = modeId;
        
        const indivContainer = document.getElementById('analytics-indiv-container');
        const teamContainer = document.getElementById('analytics-team-container');
        
        const indivBtn = document.getElementById('analytics-toggle-indiv-btn');
        const teamBtn = document.getElementById('analytics-toggle-team-btn');
        
        if (indivContainer) indivContainer.style.display = (modeId === 'individual') ? 'block' : 'none';
        if (teamContainer) teamContainer.style.display = (modeId === 'team') ? 'block' : 'none';
        
        if (indivBtn) {
            if (modeId === 'individual') indivBtn.classList.add('active');
            else indivBtn.classList.remove('active');
        }
        if (teamBtn) {
            if (modeId === 'team') teamBtn.classList.add('active');
            else teamBtn.classList.remove('active');
        }
        
        if (window.AnalyticsModule && typeof window.AnalyticsModule.renderAll === 'function') {
            window.AnalyticsModule.renderAll();
        }
    },

    updateReadinessRing(percent) {
        if (!this.progressCircle || !this.progressCircle.r || !this.progressCircle.r.baseVal) return;
        const radius = this.progressCircle.r.baseVal.value;
        const circumference = radius * 2 * Math.PI;
        this.progressCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (percent / 100) * circumference;
        this.progressCircle.style.strokeDashoffset = offset;
    },

    renderRosterList() {
        if (!this.rosterListContainer) return;
        const athletes = window.Store.getAthletes();
        this.rosterListContainer.innerHTML = '';
        if (athletes.length === 0) {
            this.rosterListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 16px; text-align: center;">No athletes logged yet</div>';
            return;
        }
        athletes.forEach(ath => {
            const card = document.createElement('div');
            card.className = 'roster-card';
            if (ath.id === this.activeRosterAthleteId) card.className += ' active';
            
            let avatarContent = this.getInitials(ath.fullName);
            if (ath.photo) {
                avatarContent = `<img src="${ath.photo}" alt="${ath.fullName}">`;
            }
            
            let metaText = `${ath.team || 'Unattached'} • ${this.calculateAge(ath.dob)} yo`;
            if (ath.role === 'staff') {
                metaText = `<span style="background: rgba(234,58,42,0.15); color: var(--accent-orange); font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(234,58,42,0.2); font-weight: bold; margin-right: 4px;">STAFF</span> ${ath.team || 'Staff'}`;
            }

            card.innerHTML = `
                <div class="athlete-img-container">${avatarContent}</div>
                <div class="roster-card-info">
                    <span class="roster-card-name">${ath.fullName}</span>
                    <span class="roster-card-meta">${metaText}</span>
                </div>
                <div style="color: var(--text-muted);"><i class="fas fa-chevron-right"></i></div>
            `;
            card.addEventListener('click', () => this.loadAthleteIntoRosterForm(ath.id));
            this.rosterListContainer.appendChild(card);
        });
    },

    loadAthleteIntoRosterForm(id) {
        this.stopWebcam();
        this.activeRosterAthleteId = id;
        this.tempPhotoBase64 = null;
        const athlete = window.Store.getAthleteById(id);
        if (athlete) {
            this.athleteDetailsPanel.style.display = 'block';
            this.athleteDetailsEmpty.style.display = 'none';
            this.athleteFullname.value = athlete.fullName;
            this.athleteNickname.value = athlete.nickname || '';
            this.athleteDob.value = athlete.dob || '';
            this.athleteAgeCalc.value = this.calculateAge(athlete.dob);
            this.athleteTeam.value = athlete.team || '';
            const jerseyInput = document.getElementById('athlete-jersey');
            const posSelect = document.getElementById('athlete-position');
            const roleSelect = document.getElementById('athlete-role');
            if (jerseyInput) jerseyInput.value = athlete.jerseyNumber || '';
            if (posSelect) posSelect.value = athlete.position || '';
            if (roleSelect) roleSelect.value = athlete.role || 'athlete';
            if (athlete.photo) {
                this.avatarImgLg.src = athlete.photo;
                this.avatarImgLg.style.display = 'block';
                this.avatarInitialsLg.style.display = 'none';
            } else {
                this.avatarImgLg.style.display = 'none';
                this.avatarInitialsLg.textContent = this.getInitials(athlete.fullName);
                this.avatarInitialsLg.style.display = 'block';
            }
            if (window.innerWidth <= 768) {
                this.athleteDetailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        }
    },

    initNewAthleteForm() {
        this.stopWebcam();
        this.activeRosterAthleteId = 'new_' + Date.now();
        this.tempPhotoBase64 = null;
        this.athleteDetailsPanel.style.display = 'block';
        this.athleteDetailsEmpty.style.display = 'none';
        
        this.athleteFullname.value = '';
        this.athleteNickname.value = '';
        this.athleteDob.value = '';
        this.athleteAgeCalc.value = '0';
        this.athleteTeam.value = '';
        const jerseyInputNew = document.getElementById('athlete-jersey');
        const posSelectNew = document.getElementById('athlete-position');
        const roleSelectNew = document.getElementById('athlete-role');
        if (jerseyInputNew) jerseyInputNew.value = '';
        if (posSelectNew) posSelectNew.value = '';
        if (roleSelectNew) roleSelectNew.value = 'athlete';
        
        this.avatarImgLg.style.display = 'none';
        this.avatarInitialsLg.textContent = '+';
        this.avatarInitialsLg.style.display = 'block';

        if (window.innerWidth <= 768) {
            this.athleteDetailsPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    },

    saveAthleteProfile() {
        if (!this.checkAdminPermission()) return;
        const fullName = this.athleteFullname.value.trim();
        const nickname = this.athleteNickname.value.trim();
        const dob = this.athleteDob.value;
        const team = this.athleteTeam.value.trim();
        const jerseyNumber = document.getElementById('athlete-jersey')?.value.trim() || '';
        const position = document.getElementById('athlete-position')?.value || '';
        const role = document.getElementById('athlete-role')?.value || 'athlete';

        if (!fullName) {
            window.WellnessModule.showToast('Full Name is required.', 'danger');
            return;
        }

        const athleteId = this.activeRosterAthleteId.startsWith('new_') ? 'athlete_' + Date.now() : this.activeRosterAthleteId;
        const existing = window.Store.getAthleteById(athleteId) || {};
        
        const photo = this.tempPhotoBase64 || existing.photo || null;

        const athlete = {
            id: athleteId,
            fullName,
            nickname,
            dob,
            team,
            jerseyNumber,
            position,
            role,
            photo,
            performanceLogs: existing.performanceLogs || []
        };

        try {
            window.Store.saveAthlete(athlete);
            window.WellnessModule.showToast('Athlete profile saved successfully!', 'success');
            
            this.currentAthleteId = athleteId;
            this.activeRosterAthleteId = athleteId;
            this.tempPhotoBase64 = null;
            this.populateAthleteSelect();
            this.globalAthleteSelect.value = athleteId;
            this.renderRosterList();
            this.loadAthleteIntoRosterForm(athleteId);
            this.updateDashboard();
        } catch (e) {
            console.error('Storage full or failed:', e);
            window.WellnessModule.showToast('Quota exceeded: Photo size too large!', 'danger');
        }
    },

    deleteAthleteProfile() {
        if (!this.checkAdminPermission()) return;
        if (!this.activeRosterAthleteId || this.activeRosterAthleteId.startsWith('new_')) return;
        if (confirm(`Are you sure you want to delete this athlete?`)) {
            window.Store.deleteAthlete(this.activeRosterAthleteId);
            const remaining = window.Store.getAthletesOnly();
            if (remaining.length > 0) {
                this.currentAthleteId = remaining[0].id;
                this.globalAthleteSelect.value = this.currentAthleteId;
                this.handleAthleteSwitch();
            } else {
                this.currentAthleteId = null;
                this.athleteDetailsPanel.style.display = 'none';
                this.athleteDetailsEmpty.style.display = 'block';
                this.handleAthleteSwitch();
            }
            this.populateAthleteSelect(); this.renderRosterList();
        }
    },

    calculateCmjMetrics() {
        if (!this.perfCmjT1 || !this.perfCmjT2 || !this.perfCmjT3) return;
        
        const t1 = parseFloat(this.perfCmjT1.value);
        const t2 = parseFloat(this.perfCmjT2.value);
        const t3 = parseFloat(this.perfCmjT3.value);
        
        const hasT1 = !isNaN(t1) && t1 > 0;
        const hasT2 = !isNaN(t2) && t2 > 0;
        const hasT3 = !isNaN(t3) && t3 > 0;
        
        // If not all 3 are filled, but at least one has input
        if (this.perfCmjT1.value || this.perfCmjT2.value || this.perfCmjT3.value) {
            if (!hasT1 || !hasT2 || !hasT3) {
                this.perfCmjMean.textContent = '-- cm';
                this.perfCmjSd.textContent = '--';
                this.perfCmjCv.textContent = '--%';
                this.perfCmjStatusBadge.innerHTML = `<div class="cv-status-warning" style="animation: none; background: rgba(234, 58, 42, 0.05); color: var(--accent-orange); border-color: rgba(234, 58, 42, 0.2);">⚠️ FILL ALL 3 TRIALS TO CALCULATE</div>`;
                if (this.savePerfLogBtn) this.savePerfLogBtn.disabled = true;
                return;
            }
        } else {
            // All empty
            this.perfCmjMean.textContent = '-- cm';
            this.perfCmjSd.textContent = '--';
            this.perfCmjCv.textContent = '--%';
            this.perfCmjStatusBadge.innerHTML = '';
            if (this.savePerfLogBtn) this.savePerfLogBtn.disabled = false;
            return;
        }
        
        // Compute Mean, SD, CV%
        const mean = (t1 + t2 + t3) / 3;
        const variance = ((t1 - mean) ** 2 + (t2 - mean) ** 2 + (t3 - mean) ** 2) / 3;
        const sd = Math.sqrt(variance);
        const cv = mean !== 0 ? (sd / mean) * 100 : 0;
        
        this.perfCmjMean.textContent = `${mean.toFixed(1)} cm`;
        this.perfCmjSd.textContent = sd.toFixed(2);
        this.perfCmjCv.textContent = `${cv.toFixed(2)}%`;
        
        if (cv > 5) {
            this.perfCmjStatusBadge.innerHTML = `<div class="cv-status-warning">❌ DATA CORRUPTED (CV > 5%) -> RE-TEST REQUIRED!</div>`;
            if (this.savePerfLogBtn) this.savePerfLogBtn.disabled = true;
        } else {
            this.perfCmjStatusBadge.innerHTML = `<div class="cv-status-success">✅ DATA VALID (CV <= 5%) -> READY TO SAVE</div>`;
            if (this.savePerfLogBtn) this.savePerfLogBtn.disabled = false;
        }
    },

    savePerformanceEntry() {
        if (!this.currentAthleteId) {
            window.WellnessModule.showToast('Please select an active athlete first.', 'danger');
            return;
        }
        const date = this.perfLogDate.value;
        if (!date) {
            window.WellnessModule.showToast('Assessment date is required.', 'danger');
            return;
        }

        const showCmj = document.getElementById('chk-col-cmj')?.checked ?? true;
        const showRsi = document.getElementById('chk-col-rsi')?.checked ?? true;
        const showWeight = document.getElementById('chk-col-weight')?.checked ?? true;
        const showE1rm = document.getElementById('chk-col-e1rm')?.checked ?? true;

        const existingLogs = window.Store.getPerformanceLogs(this.currentAthleteId);
        const logEntry = { date };

        if (showWeight) {
            logEntry.athleteWeight = parseFloat(this.perfAthleteWeight.value) || null;
        }

        if (showRsi) {
            logEntry.rsi = parseFloat(this.perfRsi.value) || null;
        }

        if (showE1rm) {
            const w = parseFloat(this.perfE1rmWeight.value) || 0;
            const r = parseInt(this.perfE1rmReps.value) || 0;
            if (w && r) {
                logEntry.weight = w;
                logEntry.reps = r;
                logEntry.e1rm = window.Store.estimateOneRepMax(w, r);
            }
        }

        let cmj = null;
        let cvVal = null;
        if (showCmj && (this.perfCmjT1.value || this.perfCmjT2.value || this.perfCmjT3.value)) {
            const t1 = parseFloat(this.perfCmjT1.value);
            const t2 = parseFloat(this.perfCmjT2.value);
            const t3 = parseFloat(this.perfCmjT3.value);

            const hasT1 = !isNaN(t1) && t1 > 0;
            const hasT2 = !isNaN(t2) && t2 > 0;
            const hasT3 = !isNaN(t3) && t3 > 0;

            if (!hasT1 || !hasT2 || !hasT3) {
                window.WellnessModule.showToast('Please fill out all 3 trials to save CMJ.', 'danger');
                return;
            }

            const mean = (t1 + t2 + t3) / 3;
            const variance = ((t1 - mean) ** 2 + (t2 - mean) ** 2 + (t3 - mean) ** 2) / 3;
            const sd = Math.sqrt(variance);
            cvVal = mean !== 0 ? parseFloat(((sd / mean) * 100).toFixed(2)) : 0;

            if (cvVal > 5) {
                window.WellnessModule.showToast('Cannot save. CMJ CV% exceeds 5% threshold!', 'danger');
                return;
            }

            cmj = parseFloat(mean.toFixed(2));
            logEntry.cmj = cmj;
            logEntry.trials = [t1, t2, t3];
            logEntry.cv = cvVal;
        }

        // Collect dynamic custom/sprint tests
        const customInputs = document.querySelectorAll('#indiv-custom-group .perf-custom-input');
        customInputs.forEach(input => {
            const testId = input.getAttribute('data-test-id');
            const val = input.value.trim();
            if (val) {
                logEntry[testId] = parseFloat(val) || null;
            }
        });

        window.Store.logPerformance(this.currentAthleteId, logEntry);

        // Check for personal records
        const maxCmj = existingLogs.length ? Math.max(...existingLogs.map(l => l.cmj || 0)) : 0;
        const maxRsi = existingLogs.length ? Math.max(...existingLogs.map(l => l.rsi || 0)) : 0;

        let isPR = false;
        let prMsg = '';
        if (cmj && cmj > maxCmj) {
            isPR = true;
            prMsg += `CMJ: ${cmj}cm (PB!) `;
        }
        if (logEntry.rsi && logEntry.rsi > maxRsi) {
            isPR = true;
            prMsg += `RSI: ${logEntry.rsi.toFixed(2)} (PB!) `;
        }

        if (isPR) {
            window.WellnessModule.showToast(`🎉 NEW PERSONAL RECORD! ${prMsg}`, 'success');
        } else {
            window.WellnessModule.showToast('Performance entry logged successfully!', 'success');
        }
        
        // Reload assessment inputs for the selected date
        this.renderPerformanceHistory(this.currentAthleteId);
        this.loadIndividualAssessmentForDate();
        this.updateDashboard();
        window.AnalyticsModule.renderAll();
    },

    deletePerformanceEntry(date) {
        if (!this.checkAdminPermission()) return;
        if (!this.currentAthleteId) return;
        if (confirm(`Are you sure you want to delete the assessment for ${date}?`)) {
            const athlete = window.Store.getAthleteById(this.currentAthleteId);
            if (athlete && athlete.performanceLogs) {
                athlete.performanceLogs = athlete.performanceLogs.filter(log => log.date !== date);
                window.Store.saveAthlete(athlete);
                window.WellnessModule.showToast('Assessment entry deleted successfully!', 'info');
                
                this.renderPerformanceHistory(this.currentAthleteId);
                this.loadIndividualAssessmentForDate();
                this.updateDashboard();
                window.AnalyticsModule.renderAll();
            }
        }
    },

    handleNewCustomTest(e) {
        e.preventDefault();
        if (!this.newTestName || !this.newTestUnit || !this.newTestCategory) return;
        const name = this.newTestName.value.trim();
        const unit = this.newTestUnit.value.trim();
        const category = this.newTestCategory.value;

        if (!name || !unit || !category) {
            window.WellnessModule.showToast('Please fill out all fields.', 'danger');
            return;
        }

        // Add to store
        window.Store.addCustomTest(name, category, unit);

        // Clear form
        this.newTestName.value = '';
        this.newTestUnit.value = '';
        this.newTestCategory.value = 'Sprint';

        // Re-render
        this.renderTestManagerList();
        this.renderTodayTestsChecklist();
        this.updateIndividualFormVisibility();

        window.WellnessModule.showToast('Custom test added successfully!', 'success');
    },

    renderTestManagerList() {
        if (!this.testManagerBody) return;
        this.testManagerBody.innerHTML = '';

        const tests = window.Store.getTests();
        tests.forEach(test => {
            const tr = document.createElement('tr');
            tr.style.cssText = 'border-bottom: 1px solid rgba(255,255,255,0.05); color: var(--text-secondary);';
            
            const isDefault = test.id === 'cmj' || test.id === 'rsi' || test.id === 'weight' || test.id === 'e1rm' || test.id === 'sprint_3_4_court' || test.id === 'sprint_full_court';
            
            const typeLabel = isDefault 
                ? '<span class="badge" style="background: rgba(59, 130, 246, 0.1); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.2);">Default</span>'
                : '<span class="badge" style="background: rgba(245, 158, 11, 0.1); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.2);">Custom</span>';

            const unitText = test.unit || '--';
            const categoryText = test.category || '--';

            let actionButton = '';
            if (!isDefault) {
                actionButton = `
                    <button class="btn btn-danger btn-sm" onclick="window.App.deleteCustomTest('${test.id}')" style="padding: 4px 8px;">
                        <i class="fas fa-trash-alt"></i> Delete
                    </button>
                `;
            } else {
                actionButton = `
                    <span style="font-size: 0.8rem; color: var(--text-muted); font-style: italic;">Locked</span>
                `;
            }

            tr.innerHTML = `
                <td style="padding: 12px 6px;"><strong>${test.name}</strong></td>
                <td style="padding: 12px 6px;">${categoryText}</td>
                <td style="padding: 12px 6px;"><code>${unitText}</code></td>
                <td style="padding: 12px 6px;">${typeLabel}</td>
                <td style="padding: 12px 6px; text-align: right;">${actionButton}</td>
            `;
            this.testManagerBody.appendChild(tr);
        });
    },

    deleteCustomTest(id) {
        if (!confirm('Are you sure you want to delete this custom test? Any existing logged data for this test will not be deleted from history, but it will no longer be shown in active forms.')) {
            return;
        }

        window.Store.deleteCustomTest(id);
        
        this.renderTestManagerList();
        this.renderTodayTestsChecklist();
        this.updateIndividualFormVisibility();
        
        if (this.assessmentTabTeam && this.assessmentTabTeam.classList.contains('active')) {
            this.renderTeamBulkSheet(false);
        } else {
            this.renderPerformanceHistory(this.currentAthleteId);
        }

        window.WellnessModule.showToast('Custom test deleted successfully.', 'success');
    },

    renderPerformanceHistory(athleteId) {
        if (!this.perfHistoryBody) return;
        
        const activeTests = window.Store.getTests().filter(t => {
            const chk = document.getElementById(`chk-col-${t.id}`);
            return chk ? chk.checked : true;
        });

        let colspanCount = 2; // Date + Action
        activeTests.forEach(t => {
            if (t.type === 'special_cmj') colspanCount += 3;
            else colspanCount += 1;
        });

        if (!athleteId) {
            this.perfHistoryBody.innerHTML = `<tr><td colspan="${colspanCount}" style="text-align: center; color: var(--text-muted); padding: 16px;">No athlete selected.</td></tr>`;
            return;
        }
        
        const logs = window.Store.getPerformanceLogs(athleteId);
        if (logs.length === 0) {
            this.perfHistoryBody.innerHTML = `<tr><td colspan="${colspanCount}" style="text-align: center; color: var(--text-muted); padding: 16px;">No historical performance logs found.</td></tr>`;
            return;
        }

        // Dynamically build the table header
        const headerEl = document.getElementById('perf-history-header');
        if (headerEl) {
            headerEl.innerHTML = '';
            const trHead = document.createElement('tr');
            trHead.style.cssText = 'text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem;';
            
            let headHTML = '<th style="padding: 12px 6px;">Date</th>';
            activeTests.forEach(test => {
                if (test.type === 'special_cmj') {
                    headHTML += `
                        <th style="padding: 12px 6px;">CMJ Trials (cm)</th>
                        <th style="padding: 12px 6px;">CMJ Mean</th>
                        <th style="padding: 12px 6px;">CV%</th>
                    `;
                } else if (test.type === 'special_e1rm') {
                    headHTML += `
                        <th style="padding: 12px 6px;">e1RM</th>
                    `;
                } else {
                    headHTML += `
                        <th style="padding: 12px 6px;">${test.name} (${test.unit})</th>
                    `;
                }
            });
            headHTML += '<th style="padding: 12px 6px; text-align: right;">Action</th>';
            trHead.innerHTML = headHTML;
            headerEl.appendChild(trHead);
        }

        this.perfHistoryBody.innerHTML = '';
        [...logs].sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(log => {
            const tr = document.createElement('tr');
            let rowHTML = `<td><strong>${log.date}</strong></td>`;
            
            activeTests.forEach(test => {
                if (test.type === 'special_cmj') {
                    const trialsStr = log.trials ? log.trials.map(t => t.toFixed(1)).join(', ') : '--';
                    const meanStr = log.cmj ? log.cmj.toFixed(1) + ' cm' : '--';
                    const cvStr = log.cv !== undefined && log.cv !== null ? log.cv.toFixed(2) + '%' : '--';
                    rowHTML += `
                        <td>${trialsStr}</td>
                        <td style="color: var(--accent-blue); font-weight: 500;">${meanStr}</td>
                        <td style="color: var(--accent-orange); font-weight: 500;">${cvStr}</td>
                    `;
                } else if (test.type === 'special_e1rm') {
                    const e1rmStr = log.weight && log.reps ? `${log.e1rm} kg (${log.weight} kg x ${log.reps})` : (log.e1rm ? `${log.e1rm} kg` : '--');
                    rowHTML += `
                        <td style="color: var(--accent-blue); font-weight: 600;">${e1rmStr}</td>
                    `;
                } else {
                    let val = '--';
                    let style = '';
                    if (test.id === 'weight') {
                        val = log.athleteWeight ? log.athleteWeight + ' kg' : '--';
                    } else if (test.id === 'rsi') {
                        val = log.rsi ? log.rsi.toFixed(2) : '--';
                        style = 'style="color: var(--accent-orange); font-weight: 500;"';
                    } else {
                        val = log[test.id] !== undefined && log[test.id] !== null ? log[test.id] + (test.unit ? ' ' + test.unit : '') : '--';
                        style = 'style="color: var(--text-primary); font-weight: 500;"';
                    }
                    rowHTML += `
                        <td ${style}>${val}</td>
                    `;
                }
            });
            
            rowHTML += `
                <td style="text-align: right;">
                    <button class="btn btn-danger btn-sm" onclick="window.App.deletePerformanceEntry('${log.date}')" style="padding: 4px 8px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            tr.innerHTML = rowHTML;
            this.perfHistoryBody.appendChild(tr);
        });
    },

    toggleAssessmentTab(tabId) {
        if (tabId === 'individual') {
            if (this.assessmentTabIndividual) this.assessmentTabIndividual.classList.add('active');
            if (this.assessmentTabTeam) this.assessmentTabTeam.classList.remove('active');
            if (this.assessmentPanelIndividual) this.assessmentPanelIndividual.style.display = 'block';
            if (this.assessmentPanelTeam) this.assessmentPanelTeam.style.display = 'none';
            this.updateIndividualFormVisibility();
            this.renderPerformanceHistory(this.currentAthleteId);
        } else if (tabId === 'team') {
            if (this.assessmentTabIndividual) this.assessmentTabIndividual.classList.remove('active');
            if (this.assessmentTabTeam) this.assessmentTabTeam.classList.add('active');
            if (this.assessmentPanelIndividual) this.assessmentPanelIndividual.style.display = 'none';
            if (this.assessmentPanelTeam) this.assessmentPanelTeam.style.display = 'block';
            this.renderTeamBulkSheet(true);
        }
    },

    renderTodayTestsChecklist() {
        const container = document.getElementById('today-tests-checklist-container');
        if (!container) return;

        // Save existing checkbox states first
        const savedStates = {};
        container.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            const id = chk.id.replace('chk-col-', '');
            savedStates[id] = chk.checked;
        });

        // Clear container except the label span
        const labelSpan = container.querySelector('span');
        container.innerHTML = '';
        if (labelSpan) container.appendChild(labelSpan);

        // Load saved todayTests from localStorage
        let todayTestsPref = {};
        try {
            todayTestsPref = JSON.parse(localStorage.getItem('personal_ams_today_tests')) || {};
        } catch (e) {
            console.error(e);
        }

        const tests = window.Store.getTests();
        tests.forEach(test => {
            const label = document.createElement('label');
            label.className = 'athlete-checkbox-label';
            label.style.cssText = 'padding: 6px 12px; margin-bottom: 0;';

            const isChecked = todayTestsPref[test.id] !== undefined 
                ? todayTestsPref[test.id] !== false 
                : (savedStates[test.id] !== undefined ? savedStates[test.id] : true);

            label.innerHTML = `
                <input type="checkbox" id="chk-col-${test.id}" ${isChecked ? 'checked' : ''}>
                <span>${test.name}</span>
            `;
            
            // Bind change event
            const chk = label.querySelector('input');
            chk.addEventListener('change', () => {
                this.toggleTestColumns();
                this.updateIndividualFormVisibility();
                this.renderPerformanceHistory(this.currentAthleteId);
            });

            container.appendChild(label);
        });
    },

    loadIndividualAssessmentForDate() {
        const date = this.perfLogDate ? this.perfLogDate.value : window.Store.getLocalDateString();
        const athlete = window.Store.getAthleteById(this.currentAthleteId);
        const existingLog = athlete?.performanceLogs?.find(log => log.date === date);

        // Reset all inputs first
        if (this.perfCmjT1) this.perfCmjT1.value = '';
        if (this.perfCmjT2) this.perfCmjT2.value = '';
        if (this.perfCmjT3) this.perfCmjT3.value = '';
        if (this.perfRsi) this.perfRsi.value = '';
        if (this.perfAthleteWeight) this.perfAthleteWeight.value = '';
        if (this.perfE1rmWeight) this.perfE1rmWeight.value = '';
        if (this.perfE1rmReps) this.perfE1rmReps.value = '';
        
        document.querySelectorAll('#indiv-custom-group .perf-custom-input').forEach(input => {
            input.value = '';
        });

        if (existingLog) {
            // Populate CMJ trials
            if (this.perfCmjT1) this.perfCmjT1.value = existingLog.trials?.[0] !== undefined ? existingLog.trials[0] : '';
            if (this.perfCmjT2) this.perfCmjT2.value = existingLog.trials?.[1] !== undefined ? existingLog.trials[1] : '';
            if (this.perfCmjT3) this.perfCmjT3.value = existingLog.trials?.[2] !== undefined ? existingLog.trials[2] : '';
            
            // Populate RSI
            if (this.perfRsi) this.perfRsi.value = existingLog.rsi !== undefined && existingLog.rsi !== null ? existingLog.rsi : '';
            
            // Populate Athlete Weight
            if (this.perfAthleteWeight) this.perfAthleteWeight.value = existingLog.athleteWeight !== undefined && existingLog.athleteWeight !== null ? existingLog.athleteWeight : '';
            
            // Populate e1RM weight and reps
            if (this.perfE1rmWeight) this.perfE1rmWeight.value = existingLog.weight !== undefined && existingLog.weight !== null ? existingLog.weight : '';
            if (this.perfE1rmReps) this.perfE1rmReps.value = existingLog.reps !== undefined && existingLog.reps !== null ? existingLog.reps : '';

            // Populate Custom Tests
            document.querySelectorAll('#indiv-custom-group .perf-custom-input').forEach(input => {
                const testId = input.getAttribute('data-test-id');
                if (testId) {
                    input.value = existingLog[testId] !== undefined && existingLog[testId] !== null ? existingLog[testId] : '';
                }
            });
        }

        // Recalculate metrics in the UI
        this.calculateCmjMetrics();
        // Trigger e1RM calculation
        if (this.perfE1rmWeight && this.perfE1rmReps && this.perfE1rmResult) {
            const w = parseFloat(this.perfE1rmWeight.value) || 0;
            const r = parseInt(this.perfE1rmReps.value) || 0;
            if (w > 0 && r > 0) {
                this.perfE1rmResult.textContent = `${window.Store.estimateOneRepMax(w, r)} kg`;
            } else {
                this.perfE1rmResult.textContent = '0 kg';
            }
        }
    },

    updateIndividualFormVisibility() {
        const showCmj = document.getElementById('chk-col-cmj')?.checked ?? true;
        const showRsi = document.getElementById('chk-col-rsi')?.checked ?? true;
        const showWeight = document.getElementById('chk-col-weight')?.checked ?? true;
        const showE1rm = document.getElementById('chk-col-e1rm')?.checked ?? true;

        document.querySelectorAll('.indiv-cmj-group').forEach(el => el.style.display = showCmj ? '' : 'none');
        document.querySelectorAll('.indiv-rsi-group').forEach(el => el.style.display = showRsi ? '' : 'none');
        document.querySelectorAll('.indiv-weight-group').forEach(el => el.style.display = showWeight ? '' : 'none');
        document.querySelectorAll('.indiv-e1rm-group').forEach(el => el.style.display = showE1rm ? '' : 'none');
        document.querySelectorAll('.indiv-rsi-weight-header').forEach(el => el.style.display = (showRsi || showWeight) ? '' : 'none');

        // Render custom test inputs
        const customContainer = document.getElementById('indiv-custom-group');
        if (customContainer) {
            customContainer.innerHTML = '';
            const tests = window.Store.getTests();
            const checkedTests = tests.filter(t => t.type === 'standard' && t.id !== 'rsi' && t.id !== 'weight');
            
            // Filter only checked ones
            const activeCustoms = checkedTests.filter(t => {
                const chk = document.getElementById(`chk-col-${t.id}`);
                return chk ? chk.checked : true;
            });

            if (activeCustoms.length > 0) {
                const title = document.createElement('h4');
                title.style.cssText = 'margin-bottom: 12px; color: var(--text-primary); font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 6px;';
                title.innerHTML = '<i class="fas fa-running" style="color: var(--accent-blue); margin-right: 6px;"></i> Additional Assessments';
                customContainer.appendChild(title);

                const grid = document.createElement('div');
                grid.style.cssText = 'display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 20px;';
                
                activeCustoms.forEach(test => {
                    const group = document.createElement('div');
                    group.className = 'form-group';
                    group.style.marginBottom = '0';
                    group.innerHTML = `
                        <label>${test.name} (${test.unit})</label>
                        <input type="number" step="0.01" class="form-control perf-custom-input" data-test-id="${test.id}" placeholder="e.g. ${test.unit === 'sec' ? '4.50' : '0.00'}">
                    `;
                    grid.appendChild(group);
                });
                customContainer.appendChild(grid);
            }
        }
    },

    renderTeamBulkSheet(rebuildOptions = true) {
        if (!this.teamBulkBody) return;
        this.teamBulkBody.innerHTML = '';
        
        // Ensure today's tests checklist is drawn first
        this.renderTodayTestsChecklist();

        if (this.teamPerfLogDate && !this.teamPerfLogDate.value) {
            this.teamPerfLogDate.value = window.Store.getLocalDateString();
        }

        const selectedDate = this.teamPerfLogDate ? this.teamPerfLogDate.value : window.Store.getLocalDateString();
        const athletes = window.Store.getAthletesOnly();
        
        // Count how many columns we are rendering (always render all columns, hide/show via toggleTestColumns)
        const tests = window.Store.getTests();

        let colspanCount = 1; // Roster Name
        tests.forEach(t => {
            if (t.type === 'special_cmj') colspanCount += 7; // Trial 1-3, Mean, SD, CV, Status
            else if (t.type === 'special_e1rm') colspanCount += 3; // e1rm Wt, Reps, Est. 1RM
            else colspanCount += 1; // standard
        });

        if (athletes.length === 0) {
            this.teamBulkBody.innerHTML = `<tr><td colspan="${colspanCount}" style="text-align: center; color: var(--text-muted); padding: 20px;">No athletes found in roster.</td></tr>`;
            if (this.saveTeamPerfBtn) this.saveTeamPerfBtn.disabled = true;
            return;
        }

        if (this.saveTeamPerfBtn) this.saveTeamPerfBtn.disabled = false;

        // Build filter options if rebuildOptions is true
        if (rebuildOptions && this.teamBulkFilterSelect) {
            const teams = ['All Teams'];
            athletes.forEach(a => {
                if (a.team && !teams.includes(a.team)) {
                    teams.push(a.team);
                }
            });
            
            const prevVal = this.teamBulkFilterSelect.value;
            this.teamBulkFilterSelect.innerHTML = '';
            teams.forEach(team => {
                const opt = document.createElement('option');
                opt.value = team;
                opt.textContent = team;
                this.teamBulkFilterSelect.appendChild(opt);
            });
            if (teams.includes(prevVal)) {
                this.teamBulkFilterSelect.value = prevVal;
            } else {
                this.teamBulkFilterSelect.value = 'All Teams';
            }
        }

        const selectedTeam = this.teamBulkFilterSelect ? this.teamBulkFilterSelect.value : 'All Teams';
        const filteredAthletes = athletes.filter(a => selectedTeam === 'All Teams' || a.team === selectedTeam);

        if (filteredAthletes.length === 0) {
            this.teamBulkBody.innerHTML = `<tr><td colspan="${colspanCount}" style="text-align: center; color: var(--text-muted); padding: 20px;">No athletes found in this team.</td></tr>`;
            return;
        }

        // Draw headers dynamically
        const headerContainer = document.getElementById('team-bulk-header');
        if (headerContainer) {
            headerContainer.innerHTML = '';
            const trHead = document.createElement('tr');
            trHead.style.cssText = 'text-align: left; border-bottom: 2px solid var(--border-color); color: var(--text-muted); font-size: 0.8rem;';
            
            let headHTML = '<th style="padding: 12px 6px; min-width: 140px;">Athlete Name</th>';
            tests.forEach(test => {
                if (test.type === 'special_cmj') {
                    headHTML += `
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 90px;">Trial 1 (cm)</th>
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 90px;">Trial 2 (cm)</th>
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 90px;">Trial 3 (cm)</th>
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 80px;">Mean</th>
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 60px;">SD</th>
                        <th class="col-cmj" style="padding: 12px 6px; min-width: 80px;">CV%</th>
                        <th class="col-status col-cmj" style="padding: 12px 6px; min-width: 85px; text-align: center;">Status</th>
                    `;
                } else if (test.type === 'special_e1rm') {
                    headHTML += `
                        <th class="col-e1rm" style="padding: 12px 6px; min-width: 95px;">e1RM Wt (kg)</th>
                        <th class="col-e1rm" style="padding: 12px 6px; min-width: 90px;">e1RM Reps</th>
                        <th class="col-e1rm" style="padding: 12px 6px; min-width: 90px;">Est. 1RM</th>
                    `;
                } else {
                    headHTML += `
                        <th class="col-${test.id}" style="padding: 12px 6px; min-width: 110px;">${test.name} (${test.unit})</th>
                    `;
                }
            });
            trHead.innerHTML = headHTML;
            headerContainer.appendChild(trHead);
        }

        filteredAthletes.forEach(athlete => {
            const tr = document.createElement('tr');
            tr.id = `team-row-${athlete.id}`;
            
            // Try to find performance log for the selected date
            const existingLog = athlete.performanceLogs?.find(log => log.date === selectedDate);
            
            let rowHTML = `<td style="padding: 10px 6px;"><strong>${this.getAthleteDisplayName(athlete)}</strong></td>`;
            
            tests.forEach(test => {
                if (test.type === 'special_cmj') {
                    const t1 = existingLog?.trials?.[0] !== undefined ? existingLog.trials[0] : '';
                    const t2 = existingLog?.trials?.[1] !== undefined ? existingLog.trials[1] : '';
                    const t3 = existingLog?.trials?.[2] !== undefined ? existingLog.trials[2] : '';
                    rowHTML += `
                        <td style="padding: 10px 6px;" class="col-cmj"><input type="number" step="0.1" class="form-control team-trial-input" data-athlete-id="${athlete.id}" data-trial="1" value="${t1}" placeholder="e.g. 45.0"></td>
                        <td style="padding: 10px 6px;" class="col-cmj"><input type="number" step="0.1" class="form-control team-trial-input" data-athlete-id="${athlete.id}" data-trial="2" value="${t2}" placeholder="e.g. 46.0"></td>
                        <td style="padding: 10px 6px;" class="col-cmj"><input type="number" step="0.1" class="form-control team-trial-input" data-athlete-id="${athlete.id}" data-trial="3" value="${t3}" placeholder="e.g. 45.5"></td>
                        <td style="padding: 10px 6px; font-weight: bold; color: var(--accent-blue);" class="team-mean col-cmj" id="team-mean-${athlete.id}">-- cm</td>
                        <td style="padding: 10px 6px;" class="team-sd col-cmj" id="team-sd-${athlete.id}">--</td>
                        <td style="padding: 10px 6px; font-weight: bold; color: var(--accent-orange);" class="team-cv col-cmj" id="team-cv-${athlete.id}">--%</td>
                        <td style="padding: 10px 6px; text-align: center;" class="col-status col-cmj" id="team-status-${athlete.id}">--</td>
                    `;
                } else if (test.type === 'special_e1rm') {
                    const e1rmWt = existingLog?.weight !== undefined ? existingLog.weight : '';
                    const e1rmReps = existingLog?.reps !== undefined ? existingLog.reps : '';
                    rowHTML += `
                        <td style="padding: 10px 6px;" class="col-e1rm"><input type="number" step="0.1" class="form-control team-e1rm-weight-input" data-athlete-id="${athlete.id}" value="${e1rmWt}" placeholder="e.g. 80"></td>
                        <td style="padding: 10px 6px;" class="col-e1rm"><input type="number" step="1" class="form-control team-e1rm-reps-input" data-athlete-id="${athlete.id}" value="${e1rmReps}" placeholder="e.g. 5"></td>
                        <td style="padding: 10px 6px; font-weight: bold; color: var(--accent-orange);" class="team-e1rm-est col-e1rm" id="team-e1rm-est-${athlete.id}">0 kg</td>
                    `;
                } else {
                    let prefillVal = '';
                    if (existingLog) {
                        if (test.id === 'weight') {
                            prefillVal = (existingLog.athleteWeight !== undefined && existingLog.athleteWeight !== null) ? existingLog.athleteWeight : '';
                        } else if (test.id === 'rsi') {
                            prefillVal = (existingLog.rsi !== undefined && existingLog.rsi !== null) ? existingLog.rsi : '';
                        } else {
                            prefillVal = (existingLog[test.id] !== undefined && existingLog[test.id] !== null) ? existingLog[test.id] : '';
                        }
                    }
                    rowHTML += `
                        <td style="padding: 10px 6px;" class="col-${test.id}">
                            <input type="number" step="0.01" class="form-control team-standard-input" 
                                   data-athlete-id="${athlete.id}" 
                                   data-test-id="${test.id}" 
                                   value="${prefillVal}" 
                                   placeholder="e.g. ${test.unit === 'sec' ? '4.50' : '0.0'}">
                        </td>
                    `;
                }
            });

            tr.innerHTML = rowHTML;
            this.teamBulkBody.appendChild(tr);
        });

        // Trigger calculations for each athlete so Mean/SD/CV% and Est. 1RM render immediately on load
        filteredAthletes.forEach(athlete => {
            this.calculateTeamRowMetrics(athlete.id);
            this.calculateTeamRowE1RM(athlete.id);
        });

        // Apply column visibility filters
        this.toggleTestColumns();
    },

    toggleTestColumns() {
        const tests = window.Store.getTests();
        const todayTests = {};

        tests.forEach(test => {
            const chk = document.getElementById(`chk-col-${test.id}`);
            const isChecked = chk ? chk.checked : true;
            todayTests[test.id] = isChecked;

            if (test.type === 'special_cmj') {
                document.querySelectorAll('.col-cmj').forEach(el => el.style.display = isChecked ? '' : 'none');
                document.querySelectorAll('.col-status').forEach(el => el.style.display = isChecked ? '' : 'none');
            } else if (test.type === 'special_e1rm') {
                document.querySelectorAll('.col-e1rm').forEach(el => el.style.display = isChecked ? '' : 'none');
            } else {
                document.querySelectorAll(`.col-${test.id}`).forEach(el => el.style.display = isChecked ? '' : 'none');
            }
        });

        // Save selection in localStorage
        try {
            localStorage.setItem('personal_ams_today_tests', JSON.stringify(todayTests));
        } catch (e) {
            console.error('Error saving today tests preferences:', e);
        }
    },

    calculateTeamRowMetrics(athleteId) {
        const row = document.getElementById(`team-row-${athleteId}`);
        if (!row) return;

        const t1Input = row.querySelector(`[data-trial="1"]`);
        const t2Input = row.querySelector(`[data-trial="2"]`);
        const t3Input = row.querySelector(`[data-trial="3"]`);
        const meanCell = document.getElementById(`team-mean-${athleteId}`);
        const sdCell = document.getElementById(`team-sd-${athleteId}`);
        const cvCell = document.getElementById(`team-cv-${athleteId}`);
        const statusCell = document.getElementById(`team-status-${athleteId}`);

        if (!t1Input || !t2Input || !t3Input) return;

        const t1 = parseFloat(t1Input.value);
        const t2 = parseFloat(t2Input.value);
        const t3 = parseFloat(t3Input.value);

        const hasT1 = !isNaN(t1) && t1 > 0;
        const hasT2 = !isNaN(t2) && t2 > 0;
        const hasT3 = !isNaN(t3) && t3 > 0;

        // Reset styling classes
        row.classList.remove('row-pass', 'row-warn');

        if (t1Input.value || t2Input.value || t3Input.value) {
            if (!hasT1 || !hasT2 || !hasT3) {
                meanCell.textContent = '-- cm';
                sdCell.textContent = '--';
                cvCell.textContent = '--%';
                statusCell.innerHTML = `<span style="color: var(--accent-orange); font-size: 0.75rem; font-weight: 600;">⚠️ INCOMPLETE</span>`;
                return;
            }
        } else {
            // All empty
            meanCell.textContent = '-- cm';
            sdCell.textContent = '--';
            cvCell.textContent = '--%';
            statusCell.textContent = '--';
            return;
        }

        // Compute Mean, SD, CV%
        const mean = (t1 + t2 + t3) / 3;
        const variance = ((t1 - mean) ** 2 + (t2 - mean) ** 2 + (t3 - mean) ** 2) / 3;
        const sd = Math.sqrt(variance);
        const cv = mean !== 0 ? (sd / mean) * 100 : 0;

        meanCell.textContent = `${mean.toFixed(1)} cm`;
        sdCell.textContent = sd.toFixed(2);
        cvCell.textContent = `${cv.toFixed(2)}%`;

        if (cv > 5) {
            row.classList.add('row-warn');
            statusCell.innerHTML = `<span style="color: #f87171; font-weight: bold; font-size: 0.75rem;">❌ FAIL</span>`;
        } else {
            row.classList.add('row-pass');
            statusCell.innerHTML = `<span style="color: #10b981; font-weight: bold; font-size: 0.75rem;">✅ PASS</span>`;
        }
    },

    calculateTeamRowE1RM(athleteId) {
        const row = document.getElementById(`team-row-${athleteId}`);
        if (!row) return;
        
        const weightInput = row.querySelector(`.team-e1rm-weight-input`);
        const repsInput = row.querySelector(`.team-e1rm-reps-input`);
        const resultSpan = document.getElementById(`team-e1rm-est-${athleteId}`);
        
        if (!weightInput || !repsInput || !resultSpan) return;
        
        const weight = parseFloat(weightInput.value) || 0;
        const reps = parseInt(repsInput.value) || 0;
        
        if (weight > 0 && reps > 0) {
            const est1RM = window.Store.estimateOneRepMax(weight, reps);
            resultSpan.textContent = `${est1RM} kg`;
        } else {
            resultSpan.textContent = '0 kg';
        }
    },

    saveTeamPerformance() {
        if (!this.teamPerfLogDate) return;
        const date = this.teamPerfLogDate.value;
        if (!date) {
            window.WellnessModule.showToast('Assessment date is required.', 'danger');
            return;
        }

        const rows = this.teamBulkBody.querySelectorAll('tr');
        const entriesToLog = [];
        const tests = window.Store.getTests();

        for (const row of rows) {
            const athleteId = row.id.replace('team-row-', '');
            if (!athleteId) continue;

            const athlete = window.Store.getAthleteById(athleteId);
            if (!athlete) continue;

            // We will build a performance log entry
            const logEntry = { date };

            // Determine if the row has any input at all
            let hasAnyInput = false;

            // Loop through all tests
            for (const test of tests) {
                const chk = document.getElementById(`chk-col-${test.id}`);
                const isChecked = chk ? chk.checked : true;
                if (!isChecked) continue;

                if (test.type === 'special_cmj') {
                    const t1Input = row.querySelector(`[data-trial="1"]`);
                    const t2Input = row.querySelector(`[data-trial="2"]`);
                    const t3Input = row.querySelector(`[data-trial="3"]`);
                    if (t1Input && t2Input && t3Input) {
                        const t1Val = t1Input.value.trim();
                        const t2Val = t2Input.value.trim();
                        const t3Val = t3Input.value.trim();

                        if (t1Val || t2Val || t3Val) {
                            hasAnyInput = true;
                            const t1 = parseFloat(t1Val);
                            const t2 = parseFloat(t2Val);
                            const t3 = parseFloat(t3Val);
                            const hasT1 = !isNaN(t1) && t1 > 0;
                            const hasT2 = !isNaN(t2) && t2 > 0;
                            const hasT3 = !isNaN(t3) && t3 > 0;

                            if (!hasT1 || !hasT2 || !hasT3) {
                                window.WellnessModule.showToast(`Athlete ${athlete.fullName} has incomplete CMJ trials. Please fill all 3 trials or clear them.`, 'danger');
                                return;
                            }

                            const mean = (t1 + t2 + t3) / 3;
                            const variance = ((t1 - mean) ** 2 + (t2 - mean) ** 2 + (t3 - mean) ** 2) / 3;
                            const sd = Math.sqrt(variance);
                            const cvVal = mean !== 0 ? parseFloat(((sd / mean) * 100).toFixed(2)) : 0;

                            if (cvVal > 5) {
                                window.WellnessModule.showToast(`Cannot save. Athlete ${athlete.fullName} has CMJ CV% (${cvVal}%) exceeding 5% threshold!`, 'danger');
                                return;
                            }

                            logEntry.cmj = parseFloat(mean.toFixed(2));
                            logEntry.trials = [t1, t2, t3];
                            logEntry.cv = cvVal;
                        }
                    }
                } else if (test.type === 'special_e1rm') {
                    const e1rmWeightInput = row.querySelector(`.team-e1rm-weight-input`);
                    const e1rmRepsInput = row.querySelector(`.team-e1rm-reps-input`);
                    if (e1rmWeightInput && e1rmRepsInput) {
                        const wVal = e1rmWeightInput.value.trim();
                        const rVal = e1rmRepsInput.value.trim();
                        if (wVal || rVal) {
                            hasAnyInput = true;
                            const weight = parseFloat(wVal) || null;
                            const reps = parseInt(rVal) || null;
                            if (weight && reps) {
                                logEntry.weight = weight;
                                logEntry.reps = reps;
                                logEntry.e1rm = window.Store.estimateOneRepMax(weight, reps);
                            }
                        }
                    }
                } else {
                    const input = row.querySelector(`.team-standard-input[data-test-id="${test.id}"]`);
                    if (input) {
                        const val = input.value.trim();
                        if (val) {
                            hasAnyInput = true;
                            const floatVal = parseFloat(val);
                            if (test.id === 'weight') {
                                logEntry.athleteWeight = floatVal;
                            } else if (test.id === 'rsi') {
                                logEntry.rsi = floatVal;
                            } else {
                                logEntry[test.id] = floatVal;
                            }
                        } else {
                            if (test.id === 'weight') {
                                logEntry.athleteWeight = null;
                            } else if (test.id === 'rsi') {
                                logEntry.rsi = null;
                            } else {
                                logEntry[test.id] = null;
                            }
                        }
                    }
                }
            }

            if (hasAnyInput) {
                entriesToLog.push({ athleteId, logEntry });
            }
        }

        if (entriesToLog.length === 0) {
            window.WellnessModule.showToast('No performance data entered to save.', 'warning');
            return;
        }

        let savedCount = 0;
        entriesToLog.forEach(({ athleteId, logEntry }) => {
            window.Store.logPerformance(athleteId, logEntry);
            savedCount++;
        });

        window.WellnessModule.showToast(`Successfully saved ${savedCount} athlete assessment(s)!`, 'success');
        this.renderTeamBulkSheet(false);
        this.updateDashboard();
        window.AnalyticsModule.renderAll();
    },

    handlePhotoUpload(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 300;
                    const MAX_HEIGHT = 300;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }

                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);

                    const base64 = canvas.toDataURL('image/webp', 0.85);
                    this.tempPhotoBase64 = base64;
                    this.avatarImgLg.src = base64;
                    this.avatarImgLg.style.display = 'block';
                    this.avatarInitialsLg.style.display = 'none';
                };
                img.onerror = () => {
                    // Fallback to raw base64 if canvas drawing fails
                    const base64 = event.target.result;
                    this.tempPhotoBase64 = base64;
                    this.avatarImgLg.src = base64;
                    this.avatarImgLg.style.display = 'block';
                    this.avatarInitialsLg.style.display = 'none';
                };
                img.src = event.target.result;
            };
            reader.readAsDataURL(file);
        }
    },

    selectPhotoSource() {
        if (this.photoSourceModal) {
            this.photoSourceModal.style.display = 'flex';
        }
    },

    hidePhotoSourceModal() {
        if (this.photoSourceModal) {
            this.photoSourceModal.style.display = 'none';
        }
    },

    startWebcam() {
        this.stopWebcam();
        if (this.webcamContainer) {
            this.webcamContainer.style.display = 'flex';
        }
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 480 }, height: { ideal: 480 } } })
            .then(stream => {
                this.webcamStream = stream;
                if (this.webcamVideo) {
                    this.webcamVideo.srcObject = stream;
                }
            })
            .catch(err => {
                console.error('Webcam error:', err);
                window.WellnessModule.showToast('Could not access webcam: ' + err.message, 'danger');
                this.stopWebcam();
            });
    },

    captureWebcam() {
        if (this.webcamVideo && this.webcamStream) {
            const canvas = document.createElement('canvas');
            canvas.width = 300;
            canvas.height = 300;
            const ctx = canvas.getContext('2d');

            const videoWidth = this.webcamVideo.videoWidth || 300;
            const videoHeight = this.webcamVideo.videoHeight || 300;
            const size = Math.min(videoWidth, videoHeight);
            const x = (videoWidth - size) / 2;
            const y = (videoHeight - size) / 2;

            ctx.translate(300, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(this.webcamVideo, x, y, size, size, 0, 0, 300, 300);

            const base64 = canvas.toDataURL('image/webp', 0.85);
            this.tempPhotoBase64 = base64;
            this.avatarImgLg.src = base64;
            this.avatarImgLg.style.display = 'block';
            this.avatarInitialsLg.style.display = 'none';

            this.stopWebcam();
        }
    },

    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
        }
        if (this.webcamVideo) {
            this.webcamVideo.srcObject = null;
        }
        if (this.webcamContainer) {
            this.webcamContainer.style.display = 'none';
        }
    },

    hexToRgb(hex) {
        hex = hex.replace('#', '');
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return `${r}, ${g}, ${b}`;
    },

    deleteExerciseFromLibrary(id, name) {
        if (!this.checkAdminPermission()) return;
        if (confirm(`Are you sure you want to delete "${name}" from the library?`)) {
            const res = window.Store.deleteExercise(id);
            if (res && res.success) {
                window.WellnessModule.showToast(`Deleted ${name} from library`, 'success');
                this.renderExerciseLibrary();
                window.WorkoutModule.populateExerciseSelect();
            } else {
                window.WellnessModule.showToast(res.error || 'Failed to delete exercise', 'danger');
            }
        }
    },

    renderExerciseLibrary() {
        if (!this.libraryGrid) return;
        this.libraryGrid.innerHTML = '';

        // Get filter state
        const searchQuery = this.libSearchInput ? this.libSearchInput.value.toLowerCase().trim() : '';
        
        let activeCategory = 'all';
        if (this.libCategoryTabs) {
            const activeTab = this.libCategoryTabs.querySelector('.tab-btn.active');
            if (activeTab) {
                activeCategory = activeTab.getAttribute('data-category').toLowerCase();
            }
        }

        const sortValue = this.libSortSelect ? this.libSortSelect.value : 'name-asc';

        // Get all exercises from Store
        const allExercises = window.Store.getExercises();

        // Calculate counts for each category BEFORE filtering
        const counts = {
            all: allExercises.length,
            mobility: 0,
            core: 0,
            'upper body': 0,
            'lower body': 0,
            power: 0,
            plyometrics: 0,
            'circuit/metcon': 0,
            cardio: 0
        };

        allExercises.forEach(ex => {
            const cat = ex.category.toLowerCase();
            if (counts[cat] !== undefined) {
                counts[cat]++;
            }
        });

        // Update counts in UI
        for (const cat in counts) {
            const safeId = cat.replace('/', '-').replace(' ', '-');
            const countSpan = document.getElementById(`count-${safeId}`);
            if (countSpan) {
                countSpan.textContent = counts[cat];
            }
        }

        // Apply filters
        let filtered = allExercises.filter(ex => {
            // Category filter
            if (activeCategory !== 'all' && ex.category.toLowerCase() !== activeCategory) {
                return false;
            }

            // Search filter (searches name or primary muscle)
            if (searchQuery) {
                const nameMatch = ex.name.toLowerCase().includes(searchQuery);
                const muscleMatch = ex.primaryMuscle.toLowerCase().includes(searchQuery);
                const catMatch = ex.category.toLowerCase().includes(searchQuery);
                return nameMatch || muscleMatch || catMatch;
            }

            return true;
        });

        // Apply sorting
        if (sortValue === 'name-asc') {
            filtered.sort((a, b) => a.name.localeCompare(b.name));
        } else if (sortValue === 'name-desc') {
            filtered.sort((a, b) => b.name.localeCompare(a.name));
        } else if (sortValue === 'category') {
            filtered.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
        }

        // Handle empty state
        if (filtered.length === 0) {
            if (this.libEmptyState) this.libEmptyState.style.display = 'flex';
            this.libraryGrid.style.display = 'none';
        } else {
            if (this.libEmptyState) this.libEmptyState.style.display = 'none';
            this.libraryGrid.style.display = 'grid';

            filtered.forEach(ex => {
                const card = document.createElement('div');
                card.className = 'glass-panel exercise-library-card';
                card.style.position = 'relative';
                card.style.overflow = 'hidden';

                // Category styling helper
                let badgeColor = '#ffffff';
                let iconClass = 'fa-dumbbell';
                const cat = ex.category.toLowerCase();
                
                if (cat.includes('mobility')) { badgeColor = '#a855f7'; iconClass = 'fa-child'; }
                else if (cat.includes('core')) { badgeColor = '#06b6d4'; iconClass = 'fa-shield-alt'; }
                else if (cat.includes('upper')) { badgeColor = '#3b82f6'; iconClass = 'fa-dumbbell'; }
                else if (cat.includes('lower')) { badgeColor = '#f59e0b'; iconClass = 'fa-running'; }
                else if (cat.includes('power')) { badgeColor = '#ef4444'; iconClass = 'fa-bolt'; }
                else if (cat.includes('plyo')) { badgeColor = '#eab308'; iconClass = 'fa-angle-double-up'; }
                else if (cat.includes('circuit') || cat.includes('metcon')) { badgeColor = '#10b981'; iconClass = 'fa-sync-alt'; }
                else { badgeColor = '#84cc16'; iconClass = 'fa-heartbeat'; }

                const isDefault = Number(ex.id) <= 34;
                const rgb = this.hexToRgb(badgeColor);

                card.innerHTML = `
                    <div class="lib-card-glow" style="background: ${badgeColor};"></div>
                    <div class="lib-card-header-icon" style="background: rgba(${rgb}, 0.1); color: ${badgeColor};">
                        <i class="fas ${iconClass}"></i>
                    </div>
                    <div class="lib-card-content">
                        <h4 class="lib-card-title">${ex.name}</h4>
                        <div class="lib-card-badges">
                            <span class="lib-badge cat-badge" style="background: rgba(${rgb}, 0.12); color: ${badgeColor}; border: 1px solid rgba(${rgb}, 0.25);">${ex.category}</span>
                            <span class="lib-badge muscle-badge"><i class="fas fa-bullseye" style="font-size: 0.7rem; margin-right: 4px;"></i>${ex.primaryMuscle}</span>
                        </div>
                    </div>
                    <div class="lib-card-actions">
                        ${!isDefault ? `
                            <button class="lib-card-action-btn delete-btn" title="Delete custom exercise" style="color: #ef4444; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.25);">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        ` : ''}
                        <button class="lib-card-action-btn add-to-workout-btn" title="Add to current workout" style="color: var(--text-primary); background: rgba(255,255,255,0.05); border: 1px solid var(--border-color);">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `;

                // Add to workout logic on click (excluding custom delete)
                card.addEventListener('click', (e) => {
                    // Check if clicked the delete button
                    const isDeleteBtn = e.target.closest('.delete-btn');
                    if (isDeleteBtn) {
                        e.stopPropagation();
                        this.deleteExerciseFromLibrary(ex.id, ex.name);
                        return;
                    }

                    this.switchView('workout');
                    if (!window.WorkoutModule.currentWorkout) {
                        window.WorkoutModule.createNewWorkout();
                    }
                    if (window.WorkoutModule.addExerciseSelect) {
                        window.WorkoutModule.addExerciseSelect.value = ex.id;
                        window.WorkoutModule.addExerciseToWorkout();
                        window.WellnessModule.showToast(`Added ${ex.name} to workout!`, 'success');
                    }
                });

                this.libraryGrid.appendChild(card);
            });
        }
    },

    addExerciseToLibrary() {
        if (!this.checkAdminPermission()) return;
        const name = this.libExName.value.trim(), category = this.libExCategory.value, muscle = this.libExMuscle.value.trim();
        if (!name || !muscle) {
            window.WellnessModule.showToast('Please fill out all fields!', 'warning');
            return;
        }

        // Duplication prevention
        const existing = window.Store.getExercises();
        const duplicate = existing.find(ex => ex.name.toLowerCase() === name.toLowerCase());
        if (duplicate) {
            window.WellnessModule.showToast(`An exercise named "${name}" already exists!`, 'danger');
            return;
        }

        window.Store.addExercise(name, category, muscle);
        window.WellnessModule.showToast('Exercise added to library!', 'success');
        this.libExName.value = ''; this.libExMuscle.value = '';
        this.renderExerciseLibrary(); window.WorkoutModule.populateExerciseSelect();
    },

    initClock() {
        const dateDisplay = document.getElementById('clock-date-display');
        const timeDisplay = document.getElementById('clock-time-display');
        const wrClock = document.getElementById('weight-room-clock');
        if (!dateDisplay || !timeDisplay) return;

        const updateClock = () => {
            const now = new Date();
            const day = String(now.getDate()).padStart(2, '0');
            const month = String(now.getMonth() + 1).padStart(2, '0');
            const year = now.getFullYear();
            
            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');
            
            dateDisplay.textContent = `${day}/${month}/${year}`;
            timeDisplay.textContent = `${hours}:${minutes}:${seconds}`;
            if (wrClock) wrClock.textContent = `${hours}:${minutes}:${seconds}`;
            const heroClock = document.getElementById('hero-clock-display');
            if (heroClock) heroClock.textContent = `${hours}:${minutes}:${seconds}`;
        };

        updateClock();
        setInterval(updateClock, 1000);
    },

    calculateAge(dobString) {
        if (!dobString) return 0;
        const today = new Date();
        const birthDate = new Date(dobString);
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
        return age;
    },

    getInitials(nameString) {
        if (!nameString) return '?';
        return nameString.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  RECONDITIONING MODULE — Completely isolated injury tracking
    // ═══════════════════════════════════════════════════════════════════════

    _reconTimerInterval: null,

    initReconView() {
        this.populateReconAthleteSelect();
        
        // Seed default reconditioning cases & logs if completely empty and athletes exist
        const hasCases = localStorage.getItem('personal_ams_recon_cases');
        const hasLogs = localStorage.getItem('personal_ams_recon_logs');
        if (!hasCases && !hasLogs) {
            const athletes = window.Store.getAthletes();
            if (athletes.length > 0) {
                const targetAthlete = athletes[0];
                const mockCase = {
                    id: 'recon_mock_1',
                    athleteId: targetAthlete.id,
                    injuryDate: '2026-05-15',
                    surgeryDate: '2026-05-20',
                    description: 'ACL reconstruction (Left knee) with meniscus repair',
                    status: 'active',
                    createdAt: new Date().toISOString()
                };
                const mockLogs = [
                    {
                        id: 'recon_log_mock_1',
                        caseId: 'recon_mock_1',
                        athleteId: targetAthlete.id,
                        date: '2026-06-01',
                        quadInvolved: 42.5,
                        quadUninvolved: 45.0,
                        quadLsi: '94.4',
                        hopLeft: 120,
                        hopRight: 140,
                        hopLsi: '85.7',
                        lateralLeft: 28,
                        lateralRight: 32,
                        lateralLsi: '87.5'
                    },
                    {
                        id: 'recon_log_mock_2',
                        caseId: 'recon_mock_1',
                        athleteId: targetAthlete.id,
                        date: '2026-06-15',
                        quadInvolved: 43.8,
                        quadUninvolved: 45.2,
                        quadLsi: '96.9',
                        hopLeft: 135,
                        hopRight: 145,
                        hopLsi: '93.1',
                        lateralLeft: 31,
                        lateralRight: 33,
                        lateralLsi: '93.9'
                    }
                ];
                localStorage.setItem('personal_ams_recon_cases', JSON.stringify([mockCase]));
                localStorage.setItem('personal_ams_recon_logs', JSON.stringify(mockLogs));
            }
        }

        if (this.reconLogDate) {
            this.reconLogDate.value = window.Store.getLocalDateString();
        }
        this.loadReconCase();
    },

    populateReconAthleteSelect() {
        if (!this.reconAthleteSelect) return;
        const athletes = window.Store.getAthletesOnly();
        this.reconAthleteSelect.innerHTML = '';
        if (athletes.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = 'No Athletes';
            this.reconAthleteSelect.appendChild(opt);
            return;
        }
        athletes.forEach(a => {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = this.getAthleteDisplayName(a);
            this.reconAthleteSelect.appendChild(opt);
        });
        // Default to global selected athlete if possible
        if (this.currentAthleteId) {
            this.reconAthleteSelect.value = this.currentAthleteId;
        }
    },

    loadReconCase() {
        const athleteId = this.reconAthleteSelect?.value;
        if (!athleteId) return;

        const existingCase = window.ReconStore.getActiveCaseForAthlete(athleteId);

        if (existingCase) {
            if (this.reconInjuryDate)  this.reconInjuryDate.value  = existingCase.injuryDate || '';
            if (this.reconSurgeryDate) this.reconSurgeryDate.value = existingCase.surgeryDate || '';
            if (this.reconInjuryDesc)  this.reconInjuryDesc.value  = existingCase.description || '';
        } else {
            if (this.reconInjuryDate)  this.reconInjuryDate.value  = '';
            if (this.reconSurgeryDate) this.reconSurgeryDate.value = '';
            if (this.reconInjuryDesc)  this.reconInjuryDesc.value  = '';
        }

        this.updateReconElapsedTimers();
        this.clearReconMetricInputs();
        this.renderReconHistory();
    },

    updateReconElapsedTimers() {
        // Clear any previous live interval
        if (this._reconTimerInterval) {
            clearInterval(this._reconTimerInterval);
            this._reconTimerInterval = null;
        }

        const update = () => {
            const injDate = this.reconInjuryDate?.value;
            const surDate = this.reconSurgeryDate?.value;
            if (this.reconElapsedInjury) {
                this.reconElapsedInjury.textContent = window.ReconStore.calculateTimeElapsed(injDate);
            }
            if (this.reconElapsedSurgery) {
                this.reconElapsedSurgery.textContent = window.ReconStore.calculateTimeElapsed(surDate);
            }
        };

        update();
        // Update every 60s for live feel
        this._reconTimerInterval = setInterval(update, 60000);
    },

    calculateReconLSI() {
        // Quad circumference
        const qInv  = this.reconQuadInvolved?.value;
        const qUninv = this.reconQuadUninvolved?.value;
        const qLsi = window.ReconStore.calculateLSI(qInv, qUninv);
        if (this.reconQuadLsi) {
            this.reconQuadLsi.textContent = qLsi !== null ? `${qLsi}%` : '--%';
            this.reconQuadLsi.className = 'stat-value recon-lsi-value' + (qLsi !== null && parseFloat(qLsi) >= 90 ? ' lsi-pass' : qLsi !== null ? ' lsi-warn' : '');
        }

        // Single leg hop
        const hL = this.reconHopLeft?.value;
        const hR = this.reconHopRight?.value;
        const hLsi = window.ReconStore.calculateLSI(Math.min(hL||0, hR||0), Math.max(hL||0, hR||0));
        if (this.reconHopLsi) {
            this.reconHopLsi.textContent = hLsi !== null ? `${hLsi}%` : '--%';
            this.reconHopLsi.className = 'stat-value recon-lsi-value' + (hLsi !== null && parseFloat(hLsi) >= 90 ? ' lsi-pass' : hLsi !== null ? ' lsi-warn' : '');
        }

        // Lateral hop
        const lL = this.reconLateralLeft?.value;
        const lR = this.reconLateralRight?.value;
        const lLsi = window.ReconStore.calculateLSI(Math.min(lL||0, lR||0), Math.max(lL||0, lR||0));
        if (this.reconLateralLsi) {
            this.reconLateralLsi.textContent = lLsi !== null ? `${lLsi}%` : '--%';
            this.reconLateralLsi.className = 'stat-value recon-lsi-value' + (lLsi !== null && parseFloat(lLsi) >= 90 ? ' lsi-pass' : lLsi !== null ? ' lsi-warn' : '');
        }
    },

    reconSaveCase() {
        if (!this.checkAdminPermission()) return;
        const athleteId = this.reconAthleteSelect?.value;
        if (!athleteId) { alert('กรุณาเลือกนักกีฬาก่อน'); return; }

        const injuryDate  = this.reconInjuryDate?.value || '';
        const surgeryDate = this.reconSurgeryDate?.value || '';
        const description = this.reconInjuryDesc?.value || '';

        if (!injuryDate) { alert('กรุณาระบุวันที่เจ็บ (Date of Injury)'); return; }

        // Check if there's already an active case for this athlete
        let existingCase = window.ReconStore.getActiveCaseForAthlete(athleteId);

        const caseData = {
            id: existingCase ? existingCase.id : 'recon_' + Date.now().toString(36),
            athleteId: athleteId,
            injuryDate: injuryDate,
            surgeryDate: surgeryDate,
            description: description,
            status: 'active',
            createdAt: existingCase ? existingCase.createdAt : new Date().toISOString()
        };

        window.ReconStore.saveCase(caseData);
        this.updateReconElapsedTimers();
        this.loadReconCase(); // Rerender case details and history panel
        alert('✅ Injury case saved!');
    },

    reconDeleteCase() {
        if (!this.checkAdminPermission()) return;
        const athleteId = this.reconAthleteSelect?.value;
        if (!athleteId) return;
        const existingCase = window.ReconStore.getActiveCaseForAthlete(athleteId);
        if (!existingCase) { alert('ไม่มี case ที่จะลบ'); return; }
        if (!confirm('⚠️ ลบ Injury Case นี้และข้อมูล Progress ทั้งหมดที่เกี่ยวข้อง?')) return;
        window.ReconStore.deleteCase(existingCase.id);
        this.loadReconCase();
        alert('🗑️ Case deleted.');
    },

    reconLogProgress() {
        if (!this.checkAdminPermission()) return;
        const athleteId = this.reconAthleteSelect?.value;
        if (!athleteId) { alert('กรุณาเลือกนักกีฬาก่อน'); return; }

        const activeCase = window.ReconStore.getActiveCaseForAthlete(athleteId);
        if (!activeCase) { alert('กรุณาบันทึก Injury Case Profile ก่อน'); return; }

        const logDate = this.reconLogDate?.value;
        if (!logDate) { alert('กรุณาเลือกวันที่ Session'); return; }

        const entry = {
            caseId: activeCase.id,
            athleteId: athleteId,
            date: logDate,
            quadInvolved:    parseFloat(this.reconQuadInvolved?.value)   || null,
            quadUninvolved:  parseFloat(this.reconQuadUninvolved?.value) || null,
            hopLeft:         parseFloat(this.reconHopLeft?.value)        || null,
            hopRight:        parseFloat(this.reconHopRight?.value)       || null,
            lateralLeft:     parseInt(this.reconLateralLeft?.value)      || null,
            lateralRight:    parseInt(this.reconLateralRight?.value)     || null
        };

        // Compute stored LSI values
        entry.quadLsi    = window.ReconStore.calculateLSI(entry.quadInvolved, entry.quadUninvolved);
        entry.hopLsi     = window.ReconStore.calculateLSI(Math.min(entry.hopLeft||0, entry.hopRight||0), Math.max(entry.hopLeft||0, entry.hopRight||0));
        entry.lateralLsi = window.ReconStore.calculateLSI(Math.min(entry.lateralLeft||0, entry.lateralRight||0), Math.max(entry.lateralLeft||0, entry.lateralRight||0));

        window.ReconStore.logProgress(entry);
        this.clearReconMetricInputs();
        this.renderReconHistory();
        alert('✅ Progress entry logged!');
    },

    clearReconMetricInputs() {
        const inputs = [
            this.reconQuadInvolved, this.reconQuadUninvolved,
            this.reconHopLeft, this.reconHopRight,
            this.reconLateralLeft, this.reconLateralRight
        ];
        inputs.forEach(i => { if (i) i.value = ''; });
        if (this.reconQuadLsi) this.reconQuadLsi.textContent = '--%';
        if (this.reconHopLsi) this.reconHopLsi.textContent = '--%';
        if (this.reconLateralLsi) this.reconLateralLsi.textContent = '--%';
        // Reset LSI classes
        [this.reconQuadLsi, this.reconHopLsi, this.reconLateralLsi].forEach(el => {
            if (el) el.className = 'stat-value recon-lsi-value';
        });
    },

    renderReconHistory() {
        if (!this.reconHistoryBody) return;
        const athleteId = this.reconAthleteSelect?.value;
        if (!athleteId) { this.reconHistoryBody.innerHTML = ''; return; }

        const activeCase = window.ReconStore.getActiveCaseForAthlete(athleteId);
        if (!activeCase) {
            this.reconHistoryBody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 24px; opacity: 0.5;">No active injury case for this athlete.</td></tr>';
            return;
        }

        const logs = window.ReconStore.getLogs(activeCase.id);

        if (logs.length === 0) {
            this.reconHistoryBody.innerHTML = '<tr><td colspan="11" style="text-align:center; padding: 24px; opacity: 0.5;">No progress entries yet. Log your first session above.</td></tr>';
            return;
        }

        const formatVal = (v) => v !== null && v !== undefined ? v : '—';
        const formatLsi = (v) => v !== null && v !== undefined ? `${v}%` : '—';
        const lsiClass = (v) => {
            if (v === null || v === undefined) return '';
            return parseFloat(v) >= 90 ? 'lsi-pass' : 'lsi-warn';
        };

        this.reconHistoryBody.innerHTML = logs.map(log => `
            <tr>
                <td style="padding: 10px 8px; white-space: nowrap;">${log.date}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.quadInvolved)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.quadUninvolved)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono ${lsiClass(log.quadLsi)}">${formatLsi(log.quadLsi)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.hopLeft)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.hopRight)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono ${lsiClass(log.hopLsi)}">${formatLsi(log.hopLsi)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.lateralLeft)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono">${formatVal(log.lateralRight)}</td>
                <td style="padding: 10px 8px; text-align: center;" class="font-mono ${lsiClass(log.lateralLsi)}">${formatLsi(log.lateralLsi)}</td>
                <td style="padding: 10px 8px; text-align: center;">
                    <button class="btn btn-danger btn-sm" onclick="window.App.reconDeleteLog('${log.id}')" title="Delete entry">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    },

    reconDeleteLog(logId) {
        if (!this.checkAdminPermission()) return;
        if (!confirm('ลบ entry นี้?')) return;
        window.ReconStore.deleteLog(logId);
        this.renderReconHistory();
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  WORKOUT V2.0 EXTENSION METHODS (Mass Assignment & Free-Text Editor)
    // ═══════════════════════════════════════════════════════════════════════
    extendWorkoutModule() {
        const self = this;

        // Save original functions
        const origCacheDOM = window.WorkoutModule.cacheDOM;
        const origBindEvents = window.WorkoutModule.bindEvents;
        const origRenderWorkout = window.WorkoutModule.renderWorkout;
        const origSaveWorkout = window.WorkoutModule.saveWorkout;
        const origCreateNewWorkout = window.WorkoutModule.createNewWorkout;
        const origLoadWorkoutList = window.WorkoutModule.loadWorkoutList;

        // Override cacheDOM
        window.WorkoutModule.cacheDOM = function() {
            origCacheDOM.call(this);
            // Mode tab buttons
            this.modeStructuredBtn = document.getElementById('workout-mode-structured-btn');
            this.modeFreetextBtn = document.getElementById('workout-mode-freetext-btn');
            this.structuredContainer = document.getElementById('workout-structured-container');
            this.freetextContainer = document.getElementById('workout-freetext-container');
            this.freetextTextarea = document.getElementById('workout-freetext-textarea');
            this.assignmentPanel = document.getElementById('workout-assignment-panel');
            this.athleteAssignmentGrid = document.getElementById('workout-athlete-assignment-grid');
            this.teamAssignSelect = document.getElementById('workout-team-assign-select');
        };

        // Override bindEvents
        window.WorkoutModule.bindEvents = function() {
            origBindEvents.call(this);

            if (this.modeStructuredBtn) {
                this.modeStructuredBtn.addEventListener('click', () => {
                    this.switchMode('structured');
                });
            }
            if (this.modeFreetextBtn) {
                this.modeFreetextBtn.addEventListener('click', () => {
                    this.switchMode('freetext');
                });
            }
        };

        // Add helper method to switch mode
        window.WorkoutModule.switchMode = function(mode) {
            if (!this.currentWorkout) return;
            this.currentWorkout.isFreeText = (mode === 'freetext');
            this.renderWorkoutModeUI();
        };

        // Add helper to render tab states
        window.WorkoutModule.renderWorkoutModeUI = function() {
            if (!this.currentWorkout) return;
            const isFree = !!this.currentWorkout.isFreeText;

            if (this.modeStructuredBtn) this.modeStructuredBtn.classList.toggle('active', !isFree);
            if (this.modeFreetextBtn) this.modeFreetextBtn.classList.toggle('active', isFree);
            if (this.structuredContainer) this.structuredContainer.style.display = isFree ? 'none' : 'block';
            if (this.freetextContainer) this.freetextContainer.style.display = isFree ? 'block' : 'none';

            if (isFree && this.freetextTextarea) {
                this.freetextTextarea.value = this.currentWorkout.freeTextContent || '';
            }
        };

        // Override renderWorkout
        window.WorkoutModule.renderWorkout = function() {
            if (!this.currentWorkout) {
                origRenderWorkout.call(this);
                if (this.assignmentPanel) this.assignmentPanel.style.display = 'none';
                return;
            }

            // Sync basic inputs
            if (this.workoutNameInput) this.workoutNameInput.value = this.currentWorkout.name || '';
            if (this.workoutDateInput) this.workoutDateInput.value = this.currentWorkout.date || '';

            // Setup mode tab UI
            this.renderWorkoutModeUI();

            // Render structured part (exercises container)
            this.exercisesContainer.innerHTML = '';
            if (!this.currentWorkout.isFreeText) {
                if (this.currentWorkout.exercises.length === 0) {
                    this.exercisesContainer.innerHTML = `
                        <div style="text-align: center; padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--border-radius-lg); background: rgba(255,255,255,0.01);">
                            <div style="font-size: 2.5rem; margin-bottom: 12px;">🏋️‍♂️</div>
                            <h3 style="margin-bottom: 6px;">Empty Workout Program</h3>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Select an exercise from the dropdown to add it to your program.</p>
                        </div>
                    `;
                } else {
                    this.currentWorkout.exercises.forEach((ex, exIndex) => {
                        const card = document.createElement('div');
                        card.className = 'exercise-card';
                        
                        let setsHTML = '';
                        ex.sets.forEach((set, setIndex) => {
                            setsHTML += `
                                <tr class="set-row">
                                    <td class="set-number">${setIndex + 1}</td>
                                    <td>
                                        <input type="number" class="form-control input-sm set-target-reps" value="${set.targetReps != null ? set.targetReps : ''}" placeholder="Target" data-ex="${exIndex}" data-set="${setIndex}">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control input-sm set-reps" value="${set.reps != null ? set.reps : ''}" placeholder="Actual" data-ex="${exIndex}" data-set="${setIndex}">
                                    </td>
                                    <td>
                                        <input type="number" class="form-control input-sm set-weight" value="${set.weight != null ? set.weight : ''}" placeholder="kg" data-ex="${exIndex}" data-set="${setIndex}">
                                    </td>
                                    <td>
                                        <input type="number" min="1" max="10" class="form-control input-sm set-rpe" value="${set.rpe != null ? set.rpe : ''}" placeholder="1-10" data-ex="${exIndex}" data-set="${setIndex}">
                                    </td>
                                    <td class="set-e1rm" style="text-align: center; font-weight: 600; color: var(--accent-orange); font-size: 0.85rem;" data-ex="${exIndex}" data-set="${setIndex}">
                                        ${set.weight && set.reps ? `${window.Store.estimateOneRepMax(set.weight, set.reps)} kg` : '-'}
                                    </td>
                                    <td style="text-align: center;">
                                        <input type="checkbox" class="set-completed" ${set.completed ? 'checked' : ''} data-ex="${exIndex}" data-set="${setIndex}" style="width: 18px; height: 18px; cursor: pointer; accent-color: var(--accent-blue);">
                                    </td>
                                    <td style="text-align: center;">
                                        <button class="icon-btn remove-set-btn" data-ex="${exIndex}" data-set="${setIndex}"><i class="fas fa-trash-alt"></i></button>
                                    </td>
                                </tr>
                            `;
                        });

                        card.innerHTML = `
                            <div class="exercise-header">
                                <div class="exercise-title" style="display: flex; align-items: center; gap: 8px;">
                                    <input type="text" class="form-control input-sm ex-group-label" value="${ex.groupLabel || ''}" placeholder="Label" data-ex="${exIndex}" style="width: 65px; font-weight: bold; text-align: center; color: var(--accent-blue); background: rgba(234, 58, 42, 0.05); border: 1px solid rgba(234, 58, 42, 0.15);" title="Group/Superset Label e.g. A1, B">
                                    <span>${ex.name}</span>
                                </div>
                                <div class="exercise-prescriptions" style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-top: 6px;">
                                    <input type="text" class="form-control input-sm ex-tempo" value="${ex.tempo || ''}" placeholder="Tempo e.g. 3010" data-ex="${exIndex}" style="width: 110px;" title="Tempo Prescription">
                                    <select class="form-control input-sm ex-rest-interval" data-ex="${exIndex}" style="width: 100px;" title="Rest Interval">
                                        <option value="30s"${(ex.restInterval || '90s') === '30s' ? ' selected' : ''}>30s</option>
                                        <option value="60s"${(ex.restInterval || '90s') === '60s' ? ' selected' : ''}>60s</option>
                                        <option value="90s"${(ex.restInterval || '90s') === '90s' ? ' selected' : ''}>90s</option>
                                        <option value="2min"${(ex.restInterval || '90s') === '2min' ? ' selected' : ''}>2min</option>
                                        <option value="3min"${(ex.restInterval || '90s') === '3min' ? ' selected' : ''}>3min</option>
                                        <option value="5min"${(ex.restInterval || '90s') === '5min' ? ' selected' : ''}>5min</option>
                                    </select>
                                    <input type="text" class="form-control input-sm ex-target-rpe" value="${ex.targetRpe || ''}" placeholder="RPE @8" data-ex="${exIndex}" style="width: 90px;" title="Target RPE / Intent">
                                </div>
                                <div class="exercise-actions" style="display: flex; gap: 6px; align-items: center;">
                                    <button class="icon-btn move-up-btn" data-ex="${exIndex}" title="Move Up" style="padding: 6px 8px; font-size: 0.85rem;"><i class="fas fa-arrow-up"></i></button>
                                    <button class="icon-btn move-down-btn" data-ex="${exIndex}" title="Move Down" style="padding: 6px 8px; font-size: 0.85rem;"><i class="fas fa-arrow-down"></i></button>
                                    <button class="btn btn-secondary btn-sm add-set-btn" data-ex="${exIndex}"><i class="fas fa-plus"></i> Add Set</button>
                                    <button class="btn btn-danger btn-sm remove-exercise-btn" data-ex="${exIndex}"><i class="fas fa-times"></i> Remove</button>
                                </div>
                            </div>
                            <table class="set-table">
                                <thead>
                                    <tr>
                                        <th style="width: 50px;">Set</th>
                                        <th>Target Reps</th>
                                        <th>Actual Reps</th>
                                        <th>Weight (kg)</th>
                                        <th style="width: 100px;">RPE (1-10)</th>
                                        <th style="width: 80px; text-align: center;">e1RM</th>
                                        <th style="width: 80px; text-align: center;">Done</th>
                                        <th style="width: 50px; text-align: center;"></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${setsHTML}
                                </tbody>
                            </table>
                        `;
                        this.exercisesContainer.appendChild(card);
                    });
                }
            }

            // Sync free-text input real-time
            if (this.freetextTextarea) {
                this.freetextTextarea.oninput = (e) => {
                    this.currentWorkout.freeTextContent = e.target.value;
                };
            }

            // Bind structured inputs
            this.bindWorkoutInputs();

            // Render Roster Assignment panel
            if (this.assignmentPanel) this.assignmentPanel.style.display = 'block';
            this.renderRosterAssignment();
        };

        // Add method to render athlete checklist
        window.WorkoutModule.renderRosterAssignment = function() {
            if (!this.athleteAssignmentGrid) return;
            this.athleteAssignmentGrid.innerHTML = '';

            const athletes = window.Store.getAthletes();
            if (athletes.length === 0) {
                this.athleteAssignmentGrid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem;">No athletes available in roster.</div>';
                return;
            }

            // Build Quick Assign select options
            if (this.teamAssignSelect) {
                this.teamAssignSelect.innerHTML = '';
                
                const optCustom = document.createElement('option');
                optCustom.value = 'custom';
                optCustom.textContent = 'Individual / Custom';
                this.teamAssignSelect.appendChild(optCustom);
                
                const optAll = document.createElement('option');
                optAll.value = 'all';
                optAll.textContent = 'All Athletes';
                this.teamAssignSelect.appendChild(optAll);

                const teams = [];
                athletes.forEach(ath => {
                    if (ath.team && !teams.includes(ath.team)) {
                        teams.push(ath.team);
                    }
                });

                teams.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = `team_${t}`;
                    opt.textContent = t;
                    this.teamAssignSelect.appendChild(opt);
                });

                this.teamAssignSelect.value = 'custom';

                if (!this.teamAssignSelect._hasListener) {
                    this.teamAssignSelect._hasListener = true;
                    this.teamAssignSelect.addEventListener('change', (e) => {
                        const val = e.target.value;
                        const checkboxes = this.athleteAssignmentGrid.querySelectorAll('.workout-assignee-checkbox');
                        if (val === 'all') {
                            checkboxes.forEach(cb => cb.checked = true);
                        } else if (val.startsWith('team_')) {
                            const teamName = val.substring(5);
                            checkboxes.forEach(cb => {
                                cb.checked = (cb.getAttribute('data-team') === teamName);
                            });
                        }
                    });
                }
            }

            // Default check current active athlete
            const currentAthId = window.App.currentAthleteId;

            athletes.forEach(ath => {
                const isChecked = (this.currentWorkout && this.currentWorkout.assignedAthletes) 
                    ? this.currentWorkout.assignedAthletes.includes(ath.id) 
                    : (ath.id === currentAthId);

                const label = document.createElement('label');
                label.className = 'athlete-checkbox-label';
                label.innerHTML = `
                    <input type="checkbox" value="${ath.id}" ${isChecked ? 'checked' : ''} class="workout-assignee-checkbox" data-team="${ath.team || ''}">
                    <span>${window.App.getAthleteDisplayName(ath)}</span>
                `;
                
                const input = label.querySelector('.workout-assignee-checkbox');
                if (input) {
                    input.addEventListener('change', () => {
                        if (this.teamAssignSelect) {
                            this.teamAssignSelect.value = 'custom';
                        }
                    });
                }

                this.athleteAssignmentGrid.appendChild(label);
            });
        };

        // Override saveWorkout
        window.WorkoutModule.saveWorkout = function() {
            if (!this.currentWorkout) return;

            if (!this.currentWorkout.name.trim()) {
                this.showToast('Please enter a workout name', 'danger');
                return;
            }

            // Update free text content if in free text mode
            if (this.currentWorkout.isFreeText && this.freetextTextarea) {
                this.currentWorkout.freeTextContent = this.freetextTextarea.value;
            }

            // Get selected athletes
            const checkedBoxes = document.querySelectorAll('.workout-assignee-checkbox');
            const selectedAthleteIds = Array.from(checkedBoxes).filter(cb => cb.checked).map(cb => cb.value);

            if (selectedAthleteIds.length === 0) {
                this.showToast('Please assign this program to at least one athlete.', 'danger');
                return;
            }

            this.currentWorkout.assignedAthletes = selectedAthleteIds;

            // Save Master Program
            const masters = JSON.parse(localStorage.getItem('atp_master_programs')) || [];
            const masterIndex = masters.findIndex(m => m.id === this.currentWorkout.id);
            if (masterIndex > -1) {
                masters[masterIndex] = JSON.parse(JSON.stringify(this.currentWorkout));
            } else {
                masters.push(JSON.parse(JSON.stringify(this.currentWorkout)));
            }
            localStorage.setItem('atp_master_programs', JSON.stringify(masters));

            // Distribute program to checked athletes logs
            selectedAthleteIds.forEach(athId => {
                const athleteWorkouts = window.Store.getWorkouts(athId);
                const existingChild = athleteWorkouts.find(w => w.parentProgramId === this.currentWorkout.id || (w.id === this.currentWorkout.id && w.athleteId === athId));

                const childWorkout = {
                    id: existingChild ? existingChild.id : 'workout_' + athId + '_' + Date.now(),
                    athleteId: athId,
                    parentProgramId: this.currentWorkout.id,
                    name: this.currentWorkout.name,
                    date: this.currentWorkout.date,
                    isFreeText: !!this.currentWorkout.isFreeText,
                    freeTextContent: this.currentWorkout.freeTextContent || '',
                    exercises: JSON.parse(JSON.stringify(this.currentWorkout.exercises || [])),
                    assignedAthletes: selectedAthleteIds
                };

                window.Store.saveWorkout(childWorkout);
            });

            this.showToast('Program saved and deployed successfully!', 'success');
            this.loadWorkoutList();

            if (window.App) {
                window.App.updateDashboard();
            }
        };

        // Override createNewWorkout
        window.WorkoutModule.createNewWorkout = function() {
            const activeAthleteId = window.App ? window.App.currentAthleteId : null;
            if (!activeAthleteId) {
                this.currentWorkout = null;
                this.renderWorkout();
                return;
            }
            this.currentWorkout = {
                id: 'program_' + Date.now(),
                name: 'Workout ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                date: window.Store.getLocalDateString(),
                isFreeText: false,
                freeTextContent: '',
                exercises: [],
                assignedAthletes: [activeAthleteId]
            };
            
            this.renderWorkout();
            this.populateExerciseSelect();
            this.loadWorkoutList();
        };

        // Override loadWorkoutList
        window.WorkoutModule.loadWorkoutList = function() {
            if (!this.workoutListContainer) return;
            
            const activeAthleteId = window.App ? window.App.currentAthleteId : null;
            if (!activeAthleteId) {
                this.workoutListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">No athlete selected</div>';
                return;
            }
            
            const workouts = window.Store.getWorkouts(activeAthleteId);
            workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
            
            this.workoutListContainer.innerHTML = '';
            
            if (workouts.length === 0) {
                this.workoutListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">No workouts logged</div>';
                return;
            }

            workouts.forEach(workout => {
                const item = document.createElement('div');
                item.className = 'workout-item';
                const isActive = this.currentWorkout && 
                    (this.currentWorkout.id === workout.id || this.currentWorkout.id === workout.parentProgramId);
                
                if (isActive) {
                    item.className += ' active';
                }
                
                let volumeText = '';
                if (workout.isFreeText) {
                    volumeText = 'Free-Text Program';
                } else {
                    const totalVol = window.Store.calculateTotalVolume(workout);
                    volumeText = `Vol: ${totalVol.toLocaleString()} kg`;
                }
                
                item.innerHTML = `
                    <div class="workout-item-title">${workout.name || 'Untitled Workout'}</div>
                    <div class="workout-item-date">${workout.date} • ${volumeText}</div>
                `;
                
                item.addEventListener('click', () => {
                    const masters = JSON.parse(localStorage.getItem('atp_master_programs')) || [];
                    const foundMaster = masters.find(m => m.id === workout.parentProgramId);
                    if (foundMaster) {
                        this.currentWorkout = JSON.parse(JSON.stringify(foundMaster));
                    } else {
                        this.currentWorkout = JSON.parse(JSON.stringify(workout));
                    }
                    this.renderWorkout();
                    this.populateExerciseSelect();
                    this.loadWorkoutList();
                });
                
                this.workoutListContainer.appendChild(item);
            });
        };
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  TEAM MATCH LOGS & TOURNAMENT TRACKER
    // ═══════════════════════════════════════════════════════════════════════
    initMatchLogView() { if (window.MatchLogModule) window.MatchLogModule.init(); },
    populateMatchLogTeamFilter() { if (window.MatchLogModule) window.MatchLogModule.populateMatchLogTeamFilter(); },
    filterMatchLogAttendance() { if (window.MatchLogModule) window.MatchLogModule.filterMatchLogAttendance(); },
    handleMatchLogIconSelect(inputEl) { if (window.MatchLogModule) window.MatchLogModule.handleMatchLogIconSelect(inputEl); },
    setMatchLogMode(mode) { if (window.MatchLogModule) window.MatchLogModule.setMatchLogMode(mode); },
    renderMatchLogAttendance() { if (window.MatchLogModule) window.MatchLogModule.renderMatchLogAttendance(); },
    renderMatchLogStaff() { if (window.MatchLogModule) window.MatchLogModule.renderMatchLogStaff(); },
    addNewStaffFromLog() { if (window.MatchLogModule) window.MatchLogModule.addNewStaffFromLog(); },
    addNewGameRow(gameData = null) { if (window.MatchLogModule) window.MatchLogModule.addNewGameRow(gameData); },
    toggleGameBoxScore(gameId) { if (window.MatchLogModule) window.MatchLogModule.toggleGameBoxScore(gameId); },
    calcGameBoxScoreEff(gameId) { if (window.MatchLogModule) window.MatchLogModule.calcGameBoxScoreEff(gameId); },
    handleGamePhotoSelect(inputEl, cardId) { if (window.MatchLogModule) window.MatchLogModule.handleGamePhotoSelect(inputEl, cardId); },
    saveMatchLog() { if (window.MatchLogModule) window.MatchLogModule.saveMatchLog(); },
    editMatchLog(id) { if (window.MatchLogModule) window.MatchLogModule.editMatchLog(id); },
    renderMatchHistoryTable() { if (window.MatchLogModule) window.MatchLogModule.renderMatchHistoryTable(); },
    deleteMatchLog(id) { if (window.MatchLogModule) window.MatchLogModule.deleteMatchLog(id); },
    renderTournamentAnalytics() { if (window.MatchLogModule) window.MatchLogModule.renderTournamentAnalytics(); },
    exportMatchLogsToCSV() { if (window.MatchLogModule) window.MatchLogModule.exportMatchLogsToCSV(); },
    initLiveTrackerView() { if (window.LiveTrackerModule) window.LiveTrackerModule.init(); },
    getLiveTrackerAthletes() { return window.LiveTrackerModule ? window.LiveTrackerModule.getLiveTrackerAthletes() : []; },
    resetLiveTrackerState() { if (window.LiveTrackerModule) window.LiveTrackerModule.resetLiveTrackerState(); },
    populateLiveTrackerMatches() { if (window.LiveTrackerModule) window.LiveTrackerModule.populateLiveTrackerMatches(); },
    setLiveTrackerMatch() { if (window.LiveTrackerModule) window.LiveTrackerModule.setLiveTrackerMatch(); },
    launchLiveTrackerForMatch(seasonMatchId) { if (window.LiveTrackerModule) window.LiveTrackerModule.launchLiveTrackerForMatch(seasonMatchId); },
    setLiveTrackerQuarter() { if (window.LiveTrackerModule) window.LiveTrackerModule.setLiveTrackerQuarter(); },
    autoSyncLiveTrackerToLinkedMatch() { if (window.LiveTrackerModule) window.LiveTrackerModule.autoSyncLiveTrackerToLinkedMatch(); },
    saveLiveTrackerSession() { if (window.LiveTrackerModule) window.LiveTrackerModule.saveLiveTrackerSession(); },
    syncLiveTrackerUI() { if (window.LiveTrackerModule) window.LiveTrackerModule.syncLiveTrackerUI(); },
    renderLiveTrackerOnCourt() { if (window.LiveTrackerModule) window.LiveTrackerModule.renderLiveTrackerOnCourt(); },
    renderLiveTrackerBench() { if (window.LiveTrackerModule) window.LiveTrackerModule.renderLiveTrackerBench(); },
    substituteLiveTrackerPlayer(id) { if (window.LiveTrackerModule) window.LiveTrackerModule.substituteLiveTrackerPlayer(id); },
    triggerCardActionFx(id, txt, fx) { if (window.LiveTrackerModule) window.LiveTrackerModule.triggerCardActionFx(id, txt, fx); },
    handleLiveTrackerCardAction(id, act) { if (window.LiveTrackerModule) window.LiveTrackerModule.handleLiveTrackerCardAction(id, act); },
    addLiveTrackerPbpEvent(evt) { if (window.LiveTrackerModule) window.LiveTrackerModule.addLiveTrackerPbpEvent(evt); },
    showOpponentModeBanner(show) { if (window.LiveTrackerModule) window.LiveTrackerModule.showOpponentModeBanner(show); },
    handleLiveTrackerOpponentAction(act) { if (window.LiveTrackerModule) window.LiveTrackerModule.handleLiveTrackerOpponentAction(act); },
    renderLiveTrackerPbpFeed() { if (window.LiveTrackerModule) window.LiveTrackerModule.renderLiveTrackerPbpFeed(); },
    editLiveTrackerPbpEvent(id) { if (window.LiveTrackerModule) window.LiveTrackerModule.editLiveTrackerPbpEvent(id); },
    saveEditedPbpEvent() { if (window.LiveTrackerModule) window.LiveTrackerModule.saveEditedPbpEvent(); },
    deleteLiveTrackerPbpEvent(id) { if (window.LiveTrackerModule) window.LiveTrackerModule.deleteLiveTrackerPbpEvent(id); },
    recalculateLiveTrackerFromPbp() { if (window.LiveTrackerModule) window.LiveTrackerModule.recalculateLiveTrackerFromPbp(); },
    undoLiveTrackerAction() { if (window.LiveTrackerModule) window.LiveTrackerModule.undoLiveTrackerAction(); },
    confirmResetLiveTracker() { if (window.LiveTrackerModule) window.LiveTrackerModule.confirmResetLiveTracker(); },
    editAthleteJerseyNumber(id) { if (window.LiveTrackerModule) window.LiveTrackerModule.editAthleteJerseyNumber(id); },
    advanceLiveTrackerQuarter() { if (window.LiveTrackerModule) window.LiveTrackerModule.advanceLiveTrackerQuarter(); },
    handleLiveTrackerKeydown(e) { if (window.LiveTrackerModule) window.LiveTrackerModule.handleLiveTrackerKeydown(e); },
    toggleLiveTrackerCheatSheet() { if (window.LiveTrackerModule) window.LiveTrackerModule.toggleLiveTrackerCheatSheet(); },
    showLiveTrackerRecap() { if (window.LiveTrackerModule) window.LiveTrackerModule.showLiveTrackerRecap(); },
    pushLiveTrackerToMatchLog() { if (window.LiveTrackerModule) window.LiveTrackerModule.pushLiveTrackerToMatchLog(); },
    openLiveTrackerWizard() { if (window.LiveTrackerModule) window.LiveTrackerModule.openLiveTrackerWizard(); },
    wizardTournamentSelectChange() { if (window.LiveTrackerModule) window.LiveTrackerModule.wizardTournamentSelectChange(); },
    renderWizardRoster() { if (window.LiveTrackerModule) window.LiveTrackerModule.renderWizardRoster(); },
    toggleWizardRosterItem(id) { if (window.LiveTrackerModule) window.LiveTrackerModule.toggleWizardRosterItem(id); },
    applyLiveTrackerWizard() { if (window.LiveTrackerModule) window.LiveTrackerModule.applyLiveTrackerWizard(); },
    renderWeightRoomView() {
        if (!this.weightRoomGrid) return;
        this.weightRoomGrid.innerHTML = '';
        
        // Initialize date select default if empty
        if (this.weightRoomDateSelect && !this.weightRoomDateSelect.value) {
            this.weightRoomDateSelect.value = window.Store.getLocalDateString();
        }
        
        const displayDate = this.weightRoomDateSelect ? this.weightRoomDateSelect.value : window.Store.getLocalDateString();
        
        // Fetch master programs
        const masters = JSON.parse(localStorage.getItem('atp_master_programs')) || [];
        
        // Filter master programs for the selected date
        const selectedPrograms = masters.filter(p => p.date === displayDate);

        if (selectedPrograms.length === 0) {
            this.weightRoomGrid.innerHTML = `
                <div style="grid-column: 1 / -1; text-align: center; padding: 120px 20px; border: 1px dashed var(--border-color); border-radius: var(--border-radius-lg); background: rgba(255,255,255,0.01);">
                    <div style="font-size: 5rem; margin-bottom: 24px;">📺</div>
                    <h2 style="margin-bottom: 12px; font-size: 2rem; font-family: 'VT323', monospace;">NO PROGRAMS SCHEDULED FOR ${displayDate}</h2>
                    <p style="color: var(--text-muted); font-size: 1.2rem; max-width: 600px; margin: 0 auto 24px;">Deploy workouts to athletes for this date in the Workout Logger to see them displayed on the big screen.</p>
                    <button class="btn btn-primary" onclick="window.App.switchView('workout')">Go to Workout Logger</button>
                </div>
            `;
            if (this.weightRoomStatus) this.weightRoomStatus.textContent = '0 PROGRAMS ACTIVE';
            return;
        }

        if (this.weightRoomStatus) {
            this.weightRoomStatus.textContent = `${selectedPrograms.length} PROGRAM${selectedPrograms.length > 1 ? 'S' : ''} ACTIVE`;
        }

        const athletes = window.Store.getAthletes();

        selectedPrograms.forEach(program => {
            const card = document.createElement('div');
            card.className = 'glass-panel weight-room-card';
            
            // Map athlete IDs to names
            const assignedNames = (program.assignedAthletes || []).map(id => {
                const a = athletes.find(ath => ath.id === id);
                return a ? this.getAthleteDisplayName(a) : id;
            }).join(', ').toUpperCase();

            let contentHTML = '';

            if (program.isFreeText) {
                // Render free-text display
                contentHTML = `
                    <div class="free-text-tv-display">
                        ${this.escapeHTML(program.freeTextContent || 'NO CONTENT')}
                    </div>
                `;
            } else {
                // Render structured table
                let rowsHTML = '';
                (program.exercises || []).forEach((ex, exIdx) => {
                    const setsDesc = ex.sets.map(s => {
                        const reps = s.targetReps != null ? s.targetReps : (s.reps != null ? s.reps : '--');
                        const w = s.weight != null ? s.weight + 'kg' : '--';
                        return `${reps}@${w}`;
                    }).join(' | ');

                    rowsHTML += `
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                            <td style="padding: 18px 10px; font-size: 1.6rem; font-weight: bold; color: var(--text-primary);">${exIdx + 1}. ${ex.name}</td>
                            <td style="padding: 18px 10px; font-size: 1.4rem; color: var(--text-secondary); text-align: center;">${ex.tempo || '—'}</td>
                            <td style="padding: 18px 10px; font-size: 1.4rem; color: var(--text-secondary); text-align: center;">${ex.restInterval || '—'}</td>
                            <td style="padding: 18px 10px; font-size: 1.6rem; color: var(--accent-orange); font-weight: bold; text-align: right; white-space: nowrap;">${setsDesc}</td>
                        </tr>
                    `;
                });

                contentHTML = `
                    <div style="overflow-x: auto;">
                        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
                            <thead>
                                <tr style="border-bottom: 2px solid var(--border-color); text-align: left;">
                                    <th style="padding: 12px 10px; font-size: 1.1rem; color: var(--text-muted);">EXERCISE</th>
                                    <th style="padding: 12px 10px; font-size: 1.1rem; color: var(--text-muted); text-align: center;">TEMPO</th>
                                    <th style="padding: 12px 10px; font-size: 1.1rem; color: var(--text-muted); text-align: center;">REST</th>
                                    <th style="padding: 12px 10px; font-size: 1.1rem; color: var(--text-muted); text-align: right;">SETS (REPS @ WEIGHT)</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHTML}
                            </tbody>
                        </table>
                    </div>
                `;
            }

            card.innerHTML = `
                <div class="weight-room-card-header" style="border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 15px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: center;">
                    <div>
                        <h2 style="font-size: 2.2rem; color: var(--text-primary); font-family: 'VT323', monospace; text-shadow: 0 0 8px rgba(0, 255, 65, 0.2);">${program.name.toUpperCase()}</h2>
                        <div style="font-size: 1rem; color: var(--text-muted); margin-top: 4px; letter-spacing: 1px;">
                            <i class="fas fa-users" style="color: var(--accent-blue); margin-right: 6px;"></i> ${assignedNames || 'UNASSIGNED'}
                        </div>
                    </div>
                    <span style="font-size: 0.9rem; padding: 4px 12px; background: rgba(0, 255, 65, 0.1); border: 1px solid rgba(0, 255, 65, 0.3); border-radius: var(--border-radius-sm); color: #00ff41; font-weight: bold; font-family: monospace;">LIVE</span>
                </div>
                <div class="weight-room-card-body">
                    ${contentHTML}
                </div>
            `;
            this.weightRoomGrid.appendChild(card);
        });
    },

    escapeHTML(str) {
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    },

    exportData() {
        const data = {
            athletes: JSON.parse(localStorage.getItem('personal_ams_athletes')) || [],
            workouts: JSON.parse(localStorage.getItem('personal_ams_workouts')) || [],
            wellness: JSON.parse(localStorage.getItem('personal_ams_wellness')) || [],
            exercises: JSON.parse(localStorage.getItem('personal_ams_exercises')) || [],
            phases: JSON.parse(localStorage.getItem('personal_ams_periodization_phases')) || [],
            matches: JSON.parse(localStorage.getItem('personal_ams_periodization_matches')) || [],
            master_programs: JSON.parse(localStorage.getItem('atp_master_programs')) || [],
            match_logs: JSON.parse(localStorage.getItem('atp_match_logs')) || [],
            recon_cases: JSON.parse(localStorage.getItem('personal_ams_recon_cases')) || [],
            recon_logs: JSON.parse(localStorage.getItem('personal_ams_recon_logs')) || [],
            theme: localStorage.getItem('atp_theme') || 'dark'
        };
        const jsonString = JSON.stringify(data, null, 4);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `atp_ams_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    },

    importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                
                if (!data.athletes && !data.workouts && !data.wellness) {
                    alert('Invalid backup file structure.');
                    return;
                }
                
                if (confirm('Are you sure you want to import this data? It will overwrite your current data on this device.')) {
                    if (data.athletes) localStorage.setItem('personal_ams_athletes', JSON.stringify(data.athletes));
                    if (data.workouts) localStorage.setItem('personal_ams_workouts', JSON.stringify(data.workouts));
                    if (data.wellness) localStorage.setItem('personal_ams_wellness', JSON.stringify(data.wellness));
                    if (data.exercises) localStorage.setItem('personal_ams_exercises', JSON.stringify(data.exercises));
                    if (data.phases) localStorage.setItem('personal_ams_periodization_phases', JSON.stringify(data.phases));
                    if (data.matches) localStorage.setItem('personal_ams_periodization_matches', JSON.stringify(data.matches));
                    if (data.master_programs) localStorage.setItem('atp_master_programs', JSON.stringify(data.master_programs));
                    if (data.match_logs) localStorage.setItem('atp_match_logs', JSON.stringify(data.match_logs));
                    if (data.recon_cases) localStorage.setItem('personal_ams_recon_cases', JSON.stringify(data.recon_cases));
                    if (data.recon_logs) localStorage.setItem('personal_ams_recon_logs', JSON.stringify(data.recon_logs));
                    if (data.theme) localStorage.setItem('atp_theme', data.theme);
                    
                    alert('Data imported successfully! The application will now reload.');
                    window.location.reload();
                }
            } catch (err) {
                console.error(err);
                alert('Failed to parse the backup file. Please make sure it is a valid JSON backup.');
            }
        };
        reader.readAsText(file);
    },

    loadCustomBgm(event) {
        const file = event.target.files[0];
        if (!file) return;

        const bgm = document.getElementById('matrixBgm');
        if (bgm) {
            // Stop YouTube
            if (window.ytPlayer && typeof window.ytPlayer.pauseVideo === 'function') {
                window.ytPlayer.pauseVideo();
            }

            const url = URL.createObjectURL(file);
            bgm.src = url;
            bgm.volume = 0.4;
            bgm.muted = false;
            this.isMuted = false;
            this.bgmType = 'html5';
            this.isPlaylistActive = false;
            
            // Update Mute button UI
            const muteIcon = this.bgmMuteBtn?.querySelector('i');
            if (muteIcon) muteIcon.className = 'fas fa-volume-up';
            const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
            const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
            if (sidebarMuteIcon) sidebarMuteIcon.className = 'fas fa-volume-up';

            // Play the song
            try {
                bgm.play().then(() => {
                    // Update BGM Panel UI
                    const statusText = document.getElementById('sidebar-bgm-status');
                    const heroStatusText = document.getElementById('hero-bgm-status');
                    const songName = file.name.substring(0, 18) + (file.name.length > 18 ? '...' : '');
                    
                    if (statusText) {
                        statusText.textContent = songName;
                        statusText.style.color = 'var(--accent-blue)';
                    }
                    if (heroStatusText) {
                        heroStatusText.textContent = 'PLAYING';
                        heroStatusText.style.color = 'var(--accent-blue)';
                    }
                }).catch(err => {
                    console.error('Audio play error:', err);
                });
            } catch (e) {
                console.error(e);
            }
        }
    },

    loadUrlBgm() {
        const input = document.getElementById('bgm-url-input');
        if (!input || !input.value) return;

        const url = input.value.trim();
        const playlistId = this.getYouTubePlaylistId(url);
        const youtubeId = this.getYouTubeId(url);

        const bgm = document.getElementById('matrixBgm');
        const statusText = document.getElementById('sidebar-bgm-status');
        const heroStatusText = document.getElementById('hero-bgm-status');

        if (playlistId) {
            // Stop HTML5 audio BGM if playing
            if (bgm) {
                bgm.pause();
                bgm.currentTime = 0;
            }

            // Check if YouTube Player is initialized and ready
            if (window.ytPlayer && this.isYtPlayerReady && typeof window.ytPlayer.loadPlaylist === 'function') {
                window.ytPlayer.loadPlaylist({
                    listType: 'playlist',
                    list: playlistId
                });
                window.ytPlayer.unMute();
                window.ytPlayer.setVolume(40);
                window.ytPlayer.playVideo();

                this.isMuted = false;
                this.bgmType = 'youtube';
                this.isPlaylistActive = true;
                this.currentYtVideoId = null;
                
                // Update Mute button UI
                const muteIcon = this.bgmMuteBtn?.querySelector('i');
                if (muteIcon) muteIcon.className = 'fas fa-volume-up';
                const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
                const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
                if (sidebarMuteIcon) sidebarMuteIcon.className = 'fas fa-volume-up';

                if (statusText) {
                    statusText.textContent = 'YT Playlist';
                    statusText.style.color = 'var(--accent-blue)';
                }
                if (heroStatusText) {
                    heroStatusText.textContent = 'PLAYING';
                    heroStatusText.style.color = 'var(--accent-blue)';
                }
                input.value = '';
            } else {
                // Not ready, queue it
                this.pendingYtAction = { type: 'playlist', id: playlistId };
                this.currentYtVideoId = null;
                initYoutubePlayer();
                
                if (statusText) {
                    statusText.textContent = 'Loading YT...';
                    statusText.style.color = 'var(--accent-orange)';
                }
                input.value = '';
            }
        } else if (youtubeId) {
            // Stop HTML5 audio BGM if playing
            if (bgm) {
                bgm.pause();
                bgm.currentTime = 0;
            }

            // Check if YouTube Player is initialized and ready
            if (window.ytPlayer && this.isYtPlayerReady && typeof window.ytPlayer.loadVideoById === 'function') {
                window.ytPlayer.loadVideoById(youtubeId);
                window.ytPlayer.unMute();
                window.ytPlayer.setVolume(40);
                window.ytPlayer.playVideo();

                this.isMuted = false;
                this.bgmType = 'youtube';
                this.isPlaylistActive = false;
                this.currentYtVideoId = youtubeId;
                
                // Update Mute button UI
                const muteIcon = this.bgmMuteBtn?.querySelector('i');
                if (muteIcon) muteIcon.className = 'fas fa-volume-up';
                const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
                const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
                if (sidebarMuteIcon) sidebarMuteIcon.className = 'fas fa-volume-up';

                if (statusText) {
                    statusText.textContent = youtubeId === 'G70S5fumHso' ? 'Matrix Theme' : 'YouTube Audio';
                    statusText.style.color = 'var(--accent-blue)';
                }
                if (heroStatusText) {
                    heroStatusText.textContent = 'PLAYING';
                    heroStatusText.style.color = 'var(--accent-blue)';
                }
                input.value = '';
            } else {
                // Not ready, queue it
                this.pendingYtAction = { type: 'video', id: youtubeId };
                this.currentYtVideoId = youtubeId;
                initYoutubePlayer();
                
                if (statusText) {
                    statusText.textContent = 'Loading YT...';
                    statusText.style.color = 'var(--accent-orange)';
                }
                input.value = '';
            }
        } else if (url.match(/\.(mp3|wav|ogg|m4a)/i) || url.startsWith('http')) {
            // Direct audio link fallback
            if (window.ytPlayer && typeof window.ytPlayer.pauseVideo === 'function') {
                window.ytPlayer.pauseVideo();
            }

            if (bgm) {
                bgm.src = url;
                bgm.volume = 0.4;
                bgm.muted = false;
                this.isMuted = false;
                this.bgmType = 'html5';
                this.isPlaylistActive = false;
                
                // Update Mute button UI
                const muteIcon = this.bgmMuteBtn?.querySelector('i');
                if (muteIcon) muteIcon.className = 'fas fa-volume-up';
                const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
                const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
                if (sidebarMuteIcon) sidebarMuteIcon.className = 'fas fa-volume-up';

                try {
                    bgm.play().then(() => {
                        if (statusText) {
                            statusText.textContent = 'Web Stream';
                            statusText.style.color = 'var(--accent-blue)';
                        }
                        if (heroStatusText) {
                            heroStatusText.textContent = 'PLAYING';
                            heroStatusText.style.color = 'var(--accent-blue)';
                        }
                        input.value = '';
                    }).catch(e => {
                        alert('Could not stream audio. Make sure the URL is a direct audio link.');
                    });
                } catch(e) {
                    console.error(e);
                }
            }
        } else {
            alert('Invalid link! Please enter a YouTube video/playlist link or direct audio link.');
        }
    },

    getYouTubeId(url) {
        const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
        const match = url.match(regExp);
        return (match && match[2].length === 11) ? match[2] : null;
    },

    getYouTubePlaylistId(url) {
        const regExp = /[&?]list=([^#\&\?]+)/;
        const match = url.match(regExp);
        return match ? match[1] : null;
    },

    executePendingYtAction() {
        if (!this.pendingYtAction || !window.ytPlayer) return;

        const action = this.pendingYtAction;
        this.pendingYtAction = null; // Clear it

        const statusText = document.getElementById('sidebar-bgm-status');
        const heroStatusText = document.getElementById('hero-bgm-status');

        // Apply initial mute state to prevent browser autoplay blocks
        if (this.isMuted) {
            if (typeof window.ytPlayer.mute === 'function') window.ytPlayer.mute();
        } else {
            if (typeof window.ytPlayer.unMute === 'function') window.ytPlayer.unMute();
        }
        
        if (typeof window.ytPlayer.setVolume === 'function') {
            window.ytPlayer.setVolume(40);
        }

        // Update Mute button UI
        const muteIcon = this.bgmMuteBtn?.querySelector('i');
        const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
        const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
        const muteClassName = this.isMuted ? 'fas fa-volume-mute' : 'fas fa-volume-up';
        if (muteIcon) muteIcon.className = muteClassName;
        if (sidebarMuteIcon) sidebarMuteIcon.className = muteClassName;

        if (action.type === 'playlist') {
            if (typeof window.ytPlayer.loadPlaylist === 'function') {
                window.ytPlayer.loadPlaylist({
                    listType: 'playlist',
                    list: action.id
                });
                window.ytPlayer.playVideo();

                this.bgmType = 'youtube';
                this.isPlaylistActive = true;
                this.currentYtVideoId = null;

                if (statusText) {
                    statusText.textContent = 'YT Playlist';
                    statusText.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
                }
            }
        } else if (action.type === 'video') {
            if (typeof window.ytPlayer.loadVideoById === 'function') {
                if (action.startSeconds !== undefined) {
                    window.ytPlayer.loadVideoById({
                        videoId: action.id,
                        startSeconds: action.startSeconds
                    });
                } else {
                    window.ytPlayer.loadVideoById(action.id);
                }
                window.ytPlayer.playVideo();

                this.bgmType = 'youtube';
                this.isPlaylistActive = false;
                this.currentYtVideoId = action.id;

                if (statusText) {
                    statusText.textContent = action.id === 'G70S5fumHso' ? 'Matrix Theme' : 'YouTube Audio';
                    statusText.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
                }
            }
        }

        if (heroStatusText) {
            heroStatusText.textContent = this.isMuted ? 'MUTED' : 'PLAYING';
            heroStatusText.style.color = this.isMuted ? 'var(--text-muted)' : 'var(--accent-blue)';
        }
    },

    playBgm() {
        const bgm = document.getElementById('matrixBgm');
        const statusText = document.getElementById('sidebar-bgm-status');
        const heroStatusText = document.getElementById('hero-bgm-status');

        this.isMuted = false;
        // Update Mute icons
        const muteIcon = this.bgmMuteBtn?.querySelector('i');
        if (muteIcon) muteIcon.className = 'fas fa-volume-up';
        const sidebarMuteBtn = document.getElementById('sidebar-bgm-mute-btn');
        const sidebarMuteIcon = sidebarMuteBtn?.querySelector('i');
        if (sidebarMuteIcon) sidebarMuteIcon.className = 'fas fa-volume-up';

        if (this.bgmType === 'youtube') {
            if (window.ytPlayer && typeof window.ytPlayer.playVideo === 'function') {
                window.ytPlayer.unMute();
                window.ytPlayer.playVideo();
                if (statusText && (statusText.textContent === 'MUTED' || statusText.textContent === 'PAUSED')) {
                    statusText.textContent = this.isPlaylistActive ? 'YT Playlist' : (this.currentYtVideoId === 'G70S5fumHso' ? 'Matrix Theme' : 'YouTube Audio');
                }
            }
        } else {
            if (bgm && bgm.src) {
                bgm.muted = false;
                try {
                    bgm.play().catch(() => {});
                } catch(e) {}
                if (statusText && (statusText.textContent === 'MUTED' || statusText.textContent === 'PAUSED')) {
                    statusText.textContent = 'Web Stream';
                }
            }
        }

        if (heroStatusText) {
            heroStatusText.textContent = 'PLAYING';
            heroStatusText.style.color = 'var(--accent-blue)';
        }
        if (statusText) {
            statusText.style.color = 'var(--accent-blue)';
        }
    },

    pauseBgm() {
        const bgm = document.getElementById('matrixBgm');
        const statusText = document.getElementById('sidebar-bgm-status');
        const heroStatusText = document.getElementById('hero-bgm-status');

        if (this.bgmType === 'youtube') {
            if (window.ytPlayer && typeof window.ytPlayer.pauseVideo === 'function') {
                window.ytPlayer.pauseVideo();
            }
        } else {
            if (bgm) {
                bgm.pause();
            }
        }

        if (heroStatusText) {
            heroStatusText.textContent = 'PAUSED';
            heroStatusText.style.color = 'var(--text-muted)';
        }
        if (statusText) {
            statusText.textContent = 'PAUSED';
            statusText.style.color = 'var(--text-muted)';
        }
    },

    skipBgm() {
        const bgm = document.getElementById('matrixBgm');
        if (this.bgmType === 'youtube') {
            if (window.ytPlayer && typeof window.ytPlayer.getPlayerState === 'function') {
                if (this.isPlaylistActive && typeof window.ytPlayer.nextVideo === 'function') {
                    window.ytPlayer.nextVideo();
                } else {
                    const curTime = window.ytPlayer.getCurrentTime();
                    window.ytPlayer.seekTo(curTime + 30, true);
                }
            }
        } else {
            if (bgm && bgm.src) {
                bgm.currentTime = Math.min((bgm.duration || 0), bgm.currentTime + 30);
            }
        }
    },

    adjustBgmVolume(val) {
        const bgm = document.getElementById('matrixBgm');
        if (bgm) {
            bgm.volume = val / 100;
        }
        if (window.ytPlayer && typeof window.ytPlayer.setVolume === 'function') {
            window.ytPlayer.setVolume(val);
        }
    },

    toggleBgmLoop() {
        this.isBgmLooping = !this.isBgmLooping;
        const bgm = document.getElementById('matrixBgm');
        if (bgm) {
            bgm.loop = this.isBgmLooping;
        }
        if (window.ytPlayer && typeof window.ytPlayer.setLoop === 'function') {
            window.ytPlayer.setLoop(this.isBgmLooping);
        }
        const loopBtn = document.getElementById('bgm-loop-btn');
        if (loopBtn) {
            if (this.isBgmLooping) {
                loopBtn.style.color = 'var(--accent-blue)';
            } else {
                loopBtn.style.color = 'var(--text-muted)';
            }
        }
    }
};

// =============================================================================
//  SUPABASE CLOUD SYNC UI & CONTROL MODULES
// =============================================================================
window.updateSyncUI = function() {
    const status = window.syncStatus || { status: 'error', message: 'Unknown State' };
    const heroBtn = document.getElementById('hero-sync-status');
    const sidebarBtn = document.getElementById('sidebar-sync-status');

    let badgeColor = 'var(--accent-orange)';
    let icon = '<i class="fas fa-exclamation-triangle"></i>';
    let text = 'LOCAL ONLY';

    if (status.status === 'connecting') {
        badgeColor = 'var(--accent-blue)';
        icon = '<i class="fas fa-spinner fa-spin"></i>';
        text = 'CONNECTING...';
    } else if (status.status === 'connected') {
        badgeColor = '#10B981'; // Green
        icon = '<i class="fas fa-check-circle"></i>';
        text = 'CONNECTED';
    } else if (status.status === 'locked') {
        badgeColor = 'var(--accent-red)';
        icon = '<i class="fas fa-lock"></i>';
        text = 'RLS LOCKED';
    } else if (status.status === 'error') {
        badgeColor = 'var(--accent-red)';
        icon = '<i class="fas fa-wifi"></i>';
        text = 'ERROR';
    }

    const htmlContent = `${icon} ${text}`;

    if (heroBtn) {
        heroBtn.style.color = badgeColor;
        heroBtn.innerHTML = htmlContent;
        heroBtn.title = status.message;
    }
    if (sidebarBtn) {
        sidebarBtn.style.color = badgeColor;
        sidebarBtn.innerHTML = htmlContent;
        sidebarBtn.title = status.message;
    }
};

App.manualSync = async function() {
    if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
        window.WellnessModule.showToast('Refreshing connection to Supabase Cloud...', 'info');
    }
    
    if (window.syncFromSupabase) {
        const updated = await window.syncFromSupabase();
        if (window.syncStatus.status === 'connected') {
            if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                window.WellnessModule.showToast('Cloud Sync Successful!', 'success');
            }
            if (updated) {
                // Re-render the currently active view instead of full page reload
                App._refreshActiveView();
            }
        } else if (window.syncStatus.status === 'locked') {
            if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                window.WellnessModule.showToast('Error: RLS policy is still locked! Check console or settings.', 'danger');
            }
        } else {
            if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                window.WellnessModule.showToast('Sync completed with status: ' + window.syncStatus.message, 'warning');
            }
        }
    }
};

// Re-render whatever view is currently visible after a sync pull
App._refreshActiveView = function() {
    const heroView = document.getElementById('hero-landing-view');
    if (heroView && getComputedStyle(heroView).display !== 'none') {
        console.log('[Sync] User is on landing page, updating landing stats.');
        App.updateLandingPageStats();
        return;
    }

    const activeView = document.querySelector('.view[style*="display: block"], .view.active');
    if (!activeView) {
        // Fallback: reload if we can't detect the active view
        setTimeout(() => window.location.reload(), 1000);
        return;
    }
    const viewId = activeView.id.replace('-view', '');
    console.log(`[Sync] Re-rendering active view: ${viewId}`);
    
    // Re-populate shared selects
    App.populateAthleteSelect();
    App.updateDashboard();
    
    // Re-render view-specific content
    if (viewId === 'reconditioning') App.initReconView();
    else if (viewId === 'assessment') { App.renderTodayTestsChecklist(); App.renderTeamBulkSheet(true); }
    else if (viewId === 'weight-room') App.renderWeightRoomView();
    else if (viewId === 'match-log') App.initMatchLogView();
    else if (viewId === 'test-manager') App.renderTestManagerList();
    else if (viewId === 'analytics') { if (App.renderAnalyticsView) App.renderAnalyticsView(); }
};

// Dedicated Force Sync for Reconditioning page
App.reconForceSync = async function() {
    const btn = document.getElementById('recon-force-sync-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Syncing...';
    }
    
    if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
        window.WellnessModule.showToast('กำลัง Sync ข้อมูล Reconditioning จาก Cloud...', 'info');
    }
    
    try {
        if (window.syncFromSupabase) {
            const updated = await window.syncFromSupabase();
            
            // Check specifically for recon keys
            const pulledKeys = window._lastSyncPulledKeys || [];
            const reconKeysPulled = pulledKeys.filter(k => k.includes('recon'));
            
            if (reconKeysPulled.length > 0) {
                console.log(`[Recon Sync] Pulled recon keys:`, reconKeysPulled);
                if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                    window.WellnessModule.showToast(`ดึงข้อมูล Reconditioning สำเร็จ! (${reconKeysPulled.length} keys)`, 'success');
                }
            } else if (window.syncStatus.status === 'connected') {
                if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                    window.WellnessModule.showToast('Sync สำเร็จ — ข้อมูลตรงกันแล้ว', 'success');
                }
            } else {
                if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                    window.WellnessModule.showToast('Sync มีปัญหา: ' + (window.syncStatus.message || 'Unknown'), 'warning');
                }
            }
            
            // Always re-render reconditioning view after sync
            App.populateReconAthleteSelect();
            App.initReconView();
        }
    } catch (e) {
        console.error('[Recon Sync] Error:', e);
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Sync Error: ' + e.message, 'danger');
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-cloud-download-alt"></i> Force Sync';
        }
    }
};

App.openDetailedMatchReport = function(matchId) {
    if (window.MatchLogModule) window.MatchLogModule.openDetailedMatchReport(matchId);
};

App.printDetailedMatchReport = function() {
    if (window.MatchLogModule) window.MatchLogModule.printDetailedMatchReport();
};
App.forceUploadToCloud = async function() {
    if (!window.supabaseClient) {
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Supabase client is not loaded.', 'danger');
        }
        return;
    }
    
    const confirmUpload = confirm('⚠️ WARNING: This will FORCE upload all of your local data to the Supabase Cloud database, overwriting whatever is currently in the cloud. Do you want to proceed?');
    if (!confirmUpload) return;
    
    try {
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Uploading all local data to Cloud...', 'info');
        }
        
        const localKeys = Object.keys(localStorage).filter(k => k.startsWith('personal_ams_') || k.startsWith('atp_'));
        let successCount = 0;
        
        for (const key of localKeys) {
            const val = localStorage.getItem(key);
            let parsedValue;
            try { parsedValue = JSON.parse(val); } catch (e) { parsedValue = val; }
            
            const { error } = await window.supabaseClient
                .from('atp_ams_store')
                .upsert({ key: key, value: parsedValue });
                
            if (error) {
                console.error(`Error forcing upload for key ${key}:`, error);
                if (error.code === '42501') {
                    if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                        window.WellnessModule.showToast('Force Upload Failed: RLS Permission Denied.', 'danger');
                    }
                    window.syncStatus = { status: 'locked', message: 'RLS Permission Denied' };
                    window.updateSyncUI();
                    return;
                }
            } else {
                successCount++;
            }
        }
        
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast(`Successfully uploaded ${successCount} datasets to Supabase Cloud!`, 'success');
        }
        window.syncStatus = { status: 'connected', message: 'Synced with Supabase Cloud' };
        window.updateSyncUI();
    } catch (e) {
        console.error('Force upload error:', e);
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Network error during upload: ' + e.message, 'danger');
        }
    }
};

App.forceDownloadFromCloud = async function() {
    if (!window.supabaseClient) {
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Supabase client is not loaded.', 'danger');
        }
        return;
    }
    
    const confirmDownload = confirm('⚠️ WARNING: This will FORCE download all data from the Supabase Cloud database and OVERWRITE all your local data in this browser. You cannot undo this. Do you want to proceed?');
    if (!confirmDownload) return;
    
    try {
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Fetching data from Cloud...', 'info');
        }
        
        const { data, error } = await window.supabaseClient
            .from('atp_ams_store')
            .select('*');
            
        if (error) {
            console.error('Failed to download from Supabase:', error);
            if (error.code === '42501') {
                if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                    window.WellnessModule.showToast('Force Download Failed: RLS Permission Denied.', 'danger');
                }
                window.syncStatus = { status: 'locked', message: 'RLS Permission Denied' };
                window.updateSyncUI();
                return;
            }
            throw error;
        }
        
        if (data && data.length > 0) {
            data.forEach(row => {
                const remoteValStr = typeof row.value === 'string' ? row.value : JSON.stringify(row.value);
                window.originalLocalStorageSetItem(row.key, remoteValStr);
            });
            
            if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                window.WellnessModule.showToast('Download complete! Reloading app...', 'success');
            }
            setTimeout(() => window.location.reload(), 1200);
        } else {
            if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
                window.WellnessModule.showToast('No data found in Cloud database.', 'warning');
            }
        }
    } catch (e) {
        console.error('Force download error:', e);
        if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
            window.WellnessModule.showToast('Network error during download: ' + e.message, 'danger');
        }
    }
};

/* ═══════════════════════════════════════════════════════════════════════════
   NEW COACH FEATURES (v3.4.0): MOMENTUM, SHOT CHART, QUICK SUB & SOCIAL CARD
   ═══════════════════════════════════════════════════════════════════════════ */

App.toggleShotChartMode = function() {
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
};

App.openShotLocationModal = function(callback) {
    if (!this.liveTracker) return;
    this.liveTracker.pendingShotCallback = callback;
    const modal = document.getElementById('live-tracker-shot-location-modal');
    if (modal) modal.style.display = 'flex';
};

App.confirmShotLocation = function(zoneName) {
    const modal = document.getElementById('live-tracker-shot-location-modal');
    if (modal) modal.style.display = 'none';
    if (this.liveTracker && typeof this.liveTracker.pendingShotCallback === 'function') {
        const cb = this.liveTracker.pendingShotCallback;
        this.liveTracker.pendingShotCallback = null;
        cb(zoneName);
    }
};

App.openQuickSubTradingModal = function() {
    if (!this.liveTracker) return;
    this.liveTracker.subSelectedOnCourtId = null;
    this.liveTracker.subSelectedBenchId = null;
    this.renderQuickSubModal();
    const modal = document.getElementById('live-tracker-sub-trading-modal');
    if (modal) modal.style.display = 'flex';
};

App.renderQuickSubModal = function() {
    if (!this.liveTracker) return;
    const onCourtGrid = document.getElementById('sub-modal-on-court-grid');
    const benchGrid = document.getElementById('sub-modal-bench-grid');
    if (!onCourtGrid || !benchGrid) return;

    const athletes = window.Store.getAthletesOnly();
    const activeTeam = this.liveTracker.teamName || 'MPS';
    const teamAthletes = athletes.filter(a => !a.team || a.team === activeTeam || a.team === 'MPS');

    const onCourtAthletes = (this.liveTracker.onCourtIds || []).map(id => athletes.find(a => a.id === id)).filter(Boolean);
    const benchAthletes = teamAthletes.filter(a => !(this.liveTracker.onCourtIds || []).includes(a.id));

    // Render On-Court Deck
    onCourtGrid.innerHTML = '';
    onCourtAthletes.forEach((ath, idx) => {
        const isSelected = this.liveTracker.subSelectedOnCourtId === ath.id;
        const card = document.createElement('div');
        card.style = `background: ${isSelected ? 'rgba(0,150,255,0.25)' : 'rgba(255,255,255,0.04)'}; border: 2px solid ${isSelected ? 'var(--accent-blue)' : 'rgba(0,150,255,0.3)'}; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.2s ease; box-shadow: ${isSelected ? '0 0 15px var(--accent-blue)' : 'none'};`;
        card.onclick = () => {
            this.liveTracker.subSelectedOnCourtId = isSelected ? null : ath.id;
            this.checkAndExecuteQuickSub();
        };

        const stats = this.liveTracker.playerStats[ath.id] || {};
        card.innerHTML = `
            <div style="font-size: 0.7rem; color: var(--accent-blue); font-weight: bold; margin-bottom: 4px;">SLOT Q${idx + 1}</div>
            <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 2px;">${this.getAthleteDisplayName(ath)}</div>
            <div style="font-size: 0.75rem; color: var(--accent-orange);">Jersey #${ath.jerseyNumber || '-'}</div>
            <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">${stats.pts || 0} pts | ${stats.pf || 0} pf</div>
            <div style="margin-top: 6px; font-size: 0.68rem; background: ${isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'}; color: ${isSelected ? '#000' : '#fff'}; padding: 3px; border-radius: 4px; font-weight: bold;">
                ${isSelected ? 'SELECTED OUT' : 'CLICK TO SUB OUT'}
            </div>
        `;
        onCourtGrid.appendChild(card);
    });

    // Render Bench Deck
    benchGrid.innerHTML = '';
    benchAthletes.forEach(ath => {
        const isSelected = this.liveTracker.subSelectedBenchId === ath.id;
        const card = document.createElement('div');
        card.style = `background: ${isSelected ? 'rgba(245,158,11,0.25)' : 'rgba(255,255,255,0.03)'}; border: 2px solid ${isSelected ? '#F59E0B' : 'rgba(245,158,11,0.3)'}; border-radius: 10px; padding: 12px; text-align: center; cursor: pointer; transition: all 0.2s ease; box-shadow: ${isSelected ? '0 0 15px #F59E0B' : 'none'};`;
        card.onclick = () => {
            this.liveTracker.subSelectedBenchId = isSelected ? null : ath.id;
            this.checkAndExecuteQuickSub();
        };

        card.innerHTML = `
            <div style="font-size: 0.7rem; color: #F59E0B; font-weight: bold; margin-bottom: 4px;">BENCH</div>
            <div style="font-weight: 800; font-size: 0.95rem; color: var(--text-primary); margin-bottom: 2px;">${this.getAthleteDisplayName(ath)}</div>
            <div style="font-size: 0.75rem; color: var(--accent-blue);">Jersey #${ath.jerseyNumber || '-'}</div>
            <div style="margin-top: 6px; font-size: 0.68rem; background: ${isSelected ? '#F59E0B' : 'rgba(255,255,255,0.1)'}; color: ${isSelected ? '#000' : '#fff'}; padding: 3px; border-radius: 4px; font-weight: bold;">
                ${isSelected ? 'SELECTED IN' : 'CLICK TO SUB IN'}
            </div>
        `;
        benchGrid.appendChild(card);
    });
};

App.checkAndExecuteQuickSub = function() {
    if (!this.liveTracker) return;
    const outId = this.liveTracker.subSelectedOnCourtId;
    const inId = this.liveTracker.subSelectedBenchId;

    if (outId && inId) {
        // Execute Sub
        const index = this.liveTracker.onCourtIds.indexOf(outId);
        if (index > -1) {
            this.liveTracker.onCourtIds[index] = inId;
            if (!this.liveTracker.playerStats[inId]) {
                this.liveTracker.playerStats[inId] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
            }
            const athletes = window.Store.getAthletesOnly();
            const outAth = athletes.find(a => a.id === outId);
            const inAth = athletes.find(a => a.id === inId);

            this.addLiveTrackerPbpEvent('SUB', `SUB IN: ${inAth ? (inAth.nickname || inAth.fullName) : inId} replacing ${outAth ? (outAth.nickname || outAth.fullName) : outId}`);
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
            window.WellnessModule.showToast(`🔄 SUBBED IN ${inAth ? (inAth.nickname || inAth.fullName) : inId}!`, 'success');
        }

        this.liveTracker.subSelectedOnCourtId = null;
        this.liveTracker.subSelectedBenchId = null;
    }
    this.renderQuickSubModal();
};

App.execPlatoonSubSwap = function(type) {
    if (!this.liveTracker) return;
    const athletes = window.Store.getAthletesOnly();
    const activeTeam = this.liveTracker.teamName || 'MPS';
    const teamAthletes = athletes.filter(a => !a.team || a.team === activeTeam || a.team === 'MPS');

    if (type === 'bench_5') {
        const benchAthletes = teamAthletes.filter(a => !(this.liveTracker.onCourtIds || []).includes(a.id));
        if (benchAthletes.length >= 5) {
            this.liveTracker.onCourtIds = benchAthletes.slice(0, 5).map(a => a.id);
            this.liveTracker.onCourtIds.forEach(id => {
                if (!this.liveTracker.playerStats[id]) {
                    this.liveTracker.playerStats[id] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
                }
            });
            this.addLiveTrackerPbpEvent('SUB', '⚡ PLATOON SUB: Full 5-man bench unit subbed in!');
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
            this.renderQuickSubModal();
            window.WellnessModule.showToast('⚡ Platoon Sub (5 Bench Players) Swapped In!', 'success');
        } else {
            window.WellnessModule.showToast('Need at least 5 bench players for a full platoon sub!', 'warning');
        }
    } else if (type === 'starters_5') {
        const starters = teamAthletes.slice(0, 5).map(a => a.id);
        if (starters.length > 0) {
            this.liveTracker.onCourtIds = starters;
            this.addLiveTrackerPbpEvent('SUB', '⭐ STARTERS UNIT: Main 5 starters returned to court!');
            this.saveLiveTrackerSession();
            this.syncLiveTrackerUI();
            this.renderQuickSubModal();
            window.WellnessModule.showToast('⭐ Main Starters Swapped In!', 'success');
        }
    }
};

App.openSocialCardModal = function(matchId) {
    let matchData = null;

    if ((matchId === 'current' || !matchId) && this.liveTracker) {
        const teamPts = this.liveTracker.scoreTeam || 0;
        const oppPts = this.liveTracker.scoreOpp || 0;
        const athletes = window.Store.getAthletes();
        
        let playerStatsList = [];
        Object.keys(this.liveTracker.playerStats || {}).forEach(athId => {
            const s = this.liveTracker.playerStats[athId];
            if (s && s.pts > 0) {
                const ath = athletes.find(a => a.id === athId);
                playerStatsList.push({
                    name: ath ? (ath.nickname || ath.fullName) : athId,
                    pts: s.pts || 0,
                    reb: s.reb || 0,
                    ast: s.ast || 0,
                    eff: s.eff || 0
                });
            }
        });
        playerStatsList.sort((a, b) => b.pts - a.pts);

        matchData = {
            teamName: this.liveTracker.teamName || 'MPS',
            oppName: this.liveTracker.oppName || 'OPPONENT',
            scoreTeam: teamPts,
            scoreOpp: oppPts,
            topScorers: playerStatsList.slice(0, 3)
        };
    } else {
        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const log = logs.find(l => l.id === matchId);
        if (log) {
            let teamPts = log.atpScore || 0;
            let oppPts = log.oppScore || 0;
            let scorers = [];
            const athletes = window.Store.getAthletes();

            if (log.games && log.games.length > 0) {
                log.games.forEach(g => {
                    if (Array.isArray(g.playerStats)) {
                        g.playerStats.forEach(ps => {
                            const ath = athletes.find(a => a.id === ps.athleteId);
                            scorers.push({
                                name: ath ? (ath.nickname || ath.fullName) : ps.athleteId,
                                pts: ps.pts || 0,
                                reb: ps.reb || 0,
                                ast: ps.ast || 0,
                                eff: ps.eff || 0
                            });
                        });
                    }
                });
            }
            scorers.sort((a, b) => b.pts - a.pts);

            matchData = {
                teamName: 'MPS',
                oppName: log.opponent || 'OPPONENT',
                scoreTeam: teamPts,
                scoreOpp: oppPts,
                topScorers: scorers.slice(0, 3)
            };
        }
    }

    if (!matchData) {
        window.WellnessModule.showToast('No match data available to generate graphic card.', 'warning');
        return;
    }

    const modal = document.getElementById('live-tracker-social-card-modal');
    if (modal) modal.style.display = 'flex';

    // Render Canvas Graphic Card
    const canvas = document.getElementById('social-card-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Background Gradient
    const grad = ctx.createLinearGradient(0, 0, 600, 600);
    grad.addColorStop(0, '#0a0a0f');
    grad.addColorStop(0.5, '#121220');
    grad.addColorStop(1, '#05050a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 600, 600);

    // Border Glow
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 580, 580);

    // Title / Header
    ctx.fillStyle = '#00f0ff';
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MATCH FINAL RESULT', 300, 55);

    // Result Badge (WIN / LOSS)
    const isWin = matchData.scoreTeam >= matchData.scoreOpp;
    ctx.fillStyle = isWin ? '#10B981' : '#EF4444';
    ctx.fillRect(220, 75, 160, 32);
    ctx.fillStyle = '#000';
    ctx.font = '900 18px sans-serif';
    ctx.fillText(isWin ? 'VICTORY 🏆' : 'DEFEAT', 300, 97);

    // Teams & Score Banner
    ctx.fillStyle = '#00f0ff';
    ctx.font = '900 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(matchData.teamName, 170, 175);

    ctx.fillStyle = '#ff6b35';
    ctx.fillText(matchData.oppName, 430, 175);

    // Huge Score Numbers
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 70px monospace';
    ctx.fillText(`${matchData.scoreTeam}`, 170, 255);
    ctx.fillStyle = '#ff6b35';
    ctx.fillText(`${matchData.scoreOpp}`, 430, 255);

    ctx.fillStyle = '#5a5a78';
    ctx.font = '900 36px sans-serif';
    ctx.fillText('VS', 300, 245);

    // Horizontal Divider
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(40, 295);
    ctx.lineTo(560, 295);
    ctx.stroke();

    // Top Performers Header
    ctx.fillStyle = '#F59E0B';
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('🔥 TOP PERFORMERS', 40, 335);

    // List Top Performers
    if (matchData.topScorers && matchData.topScorers.length > 0) {
        matchData.topScorers.forEach((p, idx) => {
            const y = 385 + (idx * 55);
            ctx.fillStyle = 'rgba(255,255,255,0.05)';
            ctx.fillRect(40, y - 28, 520, 44);

            ctx.fillStyle = '#00f0ff';
            ctx.font = '900 18px sans-serif';
            ctx.fillText(`#${idx + 1} ${p.name}`, 55, y);

            ctx.fillStyle = '#ffffff';
            ctx.font = '700 16px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(`${p.pts} PTS  |  ${p.reb} REB  |  ${p.ast} AST`, 545, y);
            ctx.textAlign = 'left';
        });
    } else {
        ctx.fillStyle = '#9898b0';
        ctx.font = '16px sans-serif';
        ctx.fillText('No individual player statistics recorded.', 40, 385);
    }

    // Footer Watermark
    ctx.fillStyle = '#5a5a78';
    ctx.font = '600 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('MPS HIGH-PERFORMANCE BASKETBALL ANALYTICS ENGINE', 300, 565);
};

App.downloadSocialCardImage = function() {
    const canvas = document.getElementById('social-card-canvas');
    if (!canvas) return;
    const imageUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = imageUrl;
    a.download = `match_summary_${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (window.WellnessModule && typeof window.WellnessModule.showToast === 'function') {
        window.WellnessModule.showToast('Downloaded Match Infographic Social Card! 📸', 'success');
    }
};

document.addEventListener('DOMContentLoaded', () => {
    window.App = App;
    App.init();

    // Global Spacebar / Enter listener for Hero Landing Gate (Arcade Launch)
    document.addEventListener('keydown', (e) => {
        const heroView = document.getElementById('hero-landing-view');
        if (heroView && heroView.style.display !== 'none' && getComputedStyle(heroView).display !== 'none') {
            if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                App.heroLaunch('live-tracker');
            }
        }
    });

    // Perform initial sync from Supabase in the background to prevent network hangs on startup
    if (window.syncFromSupabase) {
        window.syncFromSupabase()
            .then((updated) => {
                if (updated) {
                    console.log('[Sync] Background initial sync complete. Data updated.');
                    App._refreshActiveView();
                }
            })
            .catch((e) => {
                console.error('[Sync] Background initial sync error:', e);
            });
    }
});
