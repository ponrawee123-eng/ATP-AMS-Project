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

        if (mode === 'team') {
            this.switchView('team-management');
        } else if (mode === 'gym') {
            this.switchView('weight-room');
        } else if (mode === 'recon') {
            this.switchView('reconditioning');
        } else {
            this.switchView('dashboard');
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
        if (currentTheme === 'dark')   newTheme = 'light';
        else if (currentTheme === 'light') newTheme = 'matrix';
        else                           newTheme = 'dark';
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
        else if (viewId === 'live-tracker') this.initLiveTrackerView();
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

        // Render Position Depth Chart (PG, SG, SF, PF, C)
        const depthGrid = document.getElementById('team-mgmt-depth-chart-grid');
        if (depthGrid) {
            depthGrid.innerHTML = '';
            const positions = ['PG', 'SG', 'SF', 'PF', 'C'];
            
            positions.forEach(pos => {
                const posAthletes = athletes.filter(a => (a.position || 'PG').toUpperCase() === pos);
                const col = document.createElement('div');
                col.className = 'glass-panel';
                col.style = 'padding: 12px; border-top: 3px solid var(--accent-orange); border-radius: 6px; background: rgba(255,255,255,0.02);';
                
                let listHtml = '';
                if (posAthletes.length === 0) {
                    listHtml = '<div style="color: var(--text-muted); font-size: 0.75rem; font-style: italic; margin-top: 8px;">Unassigned</div>';
                } else {
                    posAthletes.forEach(ath => {
                        listHtml += `
                            <div onclick="window.App.selectAthlete('${ath.id}'); window.App.switchView('roster');" style="display: flex; align-items: center; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer;" title="Click to view athlete profile">
                                <span style="font-size: 0.8rem; font-weight: bold; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                    ${ath.nickname || ath.fullName}
                                </span>
                                <span style="font-size: 0.72rem; color: var(--accent-blue); font-weight: bold; font-family: monospace;">
                                    #${ath.jerseyNumber || ath.id.slice(-2)}
                                </span>
                            </div>
                        `;
                    });
                }

                col.innerHTML = `
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <span style="font-weight: bold; font-size: 0.85rem; color: var(--accent-orange);">${pos}</span>
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

                let photoHtml = `<div style="width: 28px; height: 28px; border-radius: 50%; background: linear-gradient(135deg, var(--accent-orange), var(--accent-red)); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem; color: #fff;">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'A')}</div>`;
                if (ath.photoData) {
                    photoHtml = `<img src="${ath.photoData}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid var(--accent-blue);">`;
                }

                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
                tr.innerHTML = `
                    <td style="padding: 10px; display: flex; align-items: center; gap: 10px;">
                        ${photoHtml}
                        <strong style="color: var(--text-primary);">${ath.fullName} ${ath.nickname ? `(${ath.nickname})` : ''}</strong>
                    </td>
                    <td style="padding: 10px; color: var(--accent-blue); font-weight: bold;">#${ath.jerseyNumber || ath.id.slice(-2)}</td>
                    <td style="padding: 10px;">${ath.position || 'PG'}</td>
                    <td style="padding: 10px;">${statusBadge}</td>
                    <td style="padding: 10px; font-weight: bold; color: ${readiness >= 80 ? '#10B981' : (readiness >= 70 ? '#F59E0B' : '#EF4444')};">${readiness}%</td>
                    <td style="padding: 10px; text-align: right;">
                        <button class="btn btn-secondary btn-xs" onclick="window.App.selectAthlete('${ath.id}'); window.App.switchView('roster');">Manage</button>
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
                    <div style="font-weight: bold; color: var(--text-primary);">${t.name}</div>
                    <div style="color: var(--text-muted); margin-top: 4px;">
                        <i class="fas fa-calendar-alt"></i> ${formattedDate} • <i class="fas fa-map-marker-alt"></i> ${t.venue || 'N/A'}
                    </div>
                    ${t.notes ? `<div style="color: var(--text-muted); font-style: italic; margin-top: 4px; font-size: 0.75rem;">Note: ${t.notes}</div>` : ''}
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
        if (!this.progressCircle) return;
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
            const roleSelect = document.getElementById('athlete-role');
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
        const roleSelectNew = document.getElementById('athlete-role');
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
    initMatchLogView() {
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
        if (!this.matchLogHistoryBody) return;
        this.matchLogHistoryBody.innerHTML = '';

        let logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        if (logs.length === 0) {
            this.matchLogHistoryBody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">No match logs found.</td></tr>';
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
                    <button class="btn btn-secondary btn-sm" onclick="window.App.editMatchLog('${log.id}')" style="padding: 4px 8px; margin-right: 4px;">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-danger btn-sm" onclick="window.App.deleteMatchLog('${log.id}')" style="padding: 4px 8px;">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </td>
            `;
            this.matchLogHistoryBody.appendChild(tr);
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
    //  LIVE STAT TRACKER (MacBook Air M4 Keyboard & Trackpad Console)
    // ═══════════════════════════════════════════════════════════════════════
    initLiveTrackerView() {
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

    resetLiveTrackerState() {
        let athletes = window.Store.getAthletesOnly();
        if (!athletes || athletes.length === 0) athletes = window.Store.getAthletes();
        const initialOnCourt = athletes.slice(0, 5).map(a => a.id);
        
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
            pbpEvents: []
        };

        athletes.forEach(a => {
            this.liveTracker.playerStats[a.id] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
        });
    },

    populateLiveTrackerMatches() {
        const select = document.getElementById('live-tracker-match-select');
        if (!select) return;
        select.innerHTML = '<option value="new">+ Create New Session</option>';

        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        logs.forEach(l => {
            const opt = document.createElement('option');
            opt.value = l.id;
            opt.textContent = `${l.title} (${l.date}) - vs ${l.opponent}`;
            select.appendChild(opt);
        });

        if (this.liveTracker && this.liveTracker.matchId) {
            select.value = this.liveTracker.matchId;
        }
    },

    setLiveTrackerMatch() {
        const select = document.getElementById('live-tracker-match-select');
        if (!select) return;
        const val = select.value;
        this.liveTracker.matchId = val;

        if (val !== 'new') {
            const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
            const match = logs.find(l => l.id === val);
            if (match) {
                const oppInput = document.getElementById('live-tracker-opp-name');
                if (oppInput && match.opponent) oppInput.value = match.opponent;
                this.liveTracker.oppName = match.opponent || 'Opponent';
                window.WellnessModule.showToast(`Linked session to ${match.title}`, 'info');
            }
        }
        this.saveLiveTrackerSession();
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
    },

    syncLiveTrackerUI() {
        if (!this.liveTracker) return;

        // Scoreboard
        const teamLabel = document.getElementById('live-tracker-team-label');
        const oppLabel = document.getElementById('live-tracker-opp-label');
        const teamScore = document.getElementById('live-tracker-team-score');
        const oppScore = document.getElementById('live-tracker-opp-score');
        const qtrLabel = document.getElementById('live-tracker-quarter-label');

        if (teamLabel) teamLabel.textContent = this.liveTracker.teamName || 'MPS';
        if (oppLabel) oppLabel.textContent = this.liveTracker.oppName || 'OPPONENT';
        if (teamScore) teamScore.textContent = this.liveTracker.scoreTeam || 0;
        if (oppScore) oppScore.textContent = this.liveTracker.scoreOpp || 0;
        if (qtrLabel) qtrLabel.textContent = this.liveTracker.quarter || 'Q1';

        this.renderLiveTrackerOnCourt();
        this.renderLiveTrackerBench();
        this.renderLiveTrackerPbpFeed();
    },

    renderLiveTrackerOnCourt() {
        const grid = document.getElementById('live-tracker-on-court-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const athletes = window.Store.getAthletesOnly();
        const onCourtAthletes = (this.liveTracker.onCourtIds || []).map(id => athletes.find(a => a.id === id)).filter(Boolean);

        const playerKeyLetters = ['Q', 'W', 'E', 'R', 'T'];
        onCourtAthletes.forEach((ath, idx) => {
            const hotkeyLetter = playerKeyLetters[idx] || (idx + 1);
            const stats = this.liveTracker.playerStats[ath.id] || { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, eff: 0 };
            const isSelected = this.liveTracker.selectedAthleteId === ath.id;

            const card = document.createElement('div');
            card.className = 'glass-panel';
            card.style = `padding: 12px; position: relative; border-radius: 8px; border: 2px solid ${isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.1)'}; background: ${isSelected ? 'rgba(0, 150, 255, 0.08)' : 'rgba(255,255,255,0.02)'}; transition: all 0.2s ease; cursor: pointer;`;
            card.onclick = () => {
                this.liveTracker.selectedAthleteId = ath.id;
                this.syncLiveTrackerUI();
            };

            const photoUrl = ath.photo || ath.photoData || null;
            let photoHtml = photoUrl 
                ? `<img src="${photoUrl}" style="width: 44px; height: 44px; border-radius: 50%; object-fit: cover; border: 1.5px solid var(--accent-blue); flex-shrink: 0;">`
                : `<div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.1rem; color: var(--accent-blue); flex-shrink: 0;">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'P')}</div>`;

            card.innerHTML = `
                <div style="position: absolute; top: 8px; right: 8px; background: var(--accent-orange); color: #000; font-weight: bold; font-size: 0.72rem; padding: 2px 6px; border-radius: 4px; font-family: monospace;">
                    [Key ${hotkeyLetter}]
                </div>
                <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 10px;">
                    ${photoHtml}
                    <div style="min-width: 0; flex-grow: 1;">
                        <div style="font-weight: bold; font-size: 0.85rem; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                            ${this.getAthleteDisplayName(ath)}
                        </div>
                        <div style="font-size: 0.72rem; color: var(--text-muted);">
                            Jersey: <strong style="color: var(--accent-blue);">#${ath.jerseyNumber || ath.id.slice(-2)}</strong>
                        </div>
                    </div>
                </div>
                <!-- Live Stats Badge Counter -->
                <div style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 3px; text-align: center; margin-bottom: 8px; font-size: 0.68rem;">
                    <div style="background: rgba(255,255,255,0.03); padding: 3px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.6rem;">PTS</span>
                        <strong style="color: var(--accent-orange); font-size: 0.8rem;">${stats.pts}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); padding: 3px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.6rem;">REB</span>
                        <strong style="color: var(--text-primary);">${stats.reb}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); padding: 3px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.6rem;">AST</span>
                        <strong style="color: var(--text-primary);">${stats.ast}</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); padding: 3px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.6rem;">PF</span>
                        <strong style="color: ${stats.pf >= 5 ? '#EF4444' : (stats.pf === 4 ? '#F59E0B' : 'var(--text-primary)')};">${stats.pf}/5</strong>
                    </div>
                    <div style="background: rgba(255,255,255,0.03); padding: 3px; border-radius: 4px;">
                        <span style="color: var(--text-muted); display: block; font-size: 0.6rem;">+/-</span>
                        <strong style="color: ${stats.pm > 0 ? '#10B981' : (stats.pm < 0 ? '#EF4444' : 'var(--text-muted)')};">${stats.pm > 0 ? '+' + stats.pm : stats.pm}</strong>
                    </div>
                </div>

                <!-- Trackpad Fallback Quick Action Buttons (Including Missed Shots!) -->
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px;" onclick="event.stopPropagation()">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', '2')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #10B981;" title="+2 PTS Made">+2</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'c')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #EF4444;" title="2PT Missed">2Miss</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', '3')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #10B981;" title="+3 PTS Made">+3</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'v')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #EF4444;" title="3PT Missed">3Miss</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', '1')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(16, 185, 129, 0.12); border-color: rgba(16, 185, 129, 0.3); color: #10B981;" title="+1 FT Made">+1FT</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'g')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.25); color: #EF4444;" title="FT Missed">FTMiss</button>
                </div>
                <div style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; margin-top: 3px;" onclick="event.stopPropagation()">
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'r')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center;">REB</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'a')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center;">AST</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 's')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center;">STL</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'b')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center;">BLK</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 't')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center;">TO</button>
                    <button type="button" class="btn btn-secondary btn-sm" onclick="window.App.handleLiveTrackerCardAction('${ath.id}', 'x')" style="font-size: 0.6rem; padding: 3px 2px; justify-content: center; border-color: ${stats.pf >= 4 ? '#EF4444' : 'rgba(255,255,255,0.1)'}">Foul</button>
                </div>
            `;
            grid.appendChild(card);
        });
    },

    renderLiveTrackerBench() {
        const grid = document.getElementById('live-tracker-bench-grid');
        if (!grid) return;
        grid.innerHTML = '';

        const athletes = window.Store.getAthletesOnly();
        const benchAthletes = athletes.filter(a => !(this.liveTracker.onCourtIds || []).includes(a.id));

        if (benchAthletes.length === 0) {
            grid.innerHTML = '<div style="color: var(--text-muted); font-size: 0.75rem;">All roster athletes are on court.</div>';
            return;
        }

        benchAthletes.forEach(ath => {
            const card = document.createElement('div');
            card.style = 'background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06); border-radius: 6px; padding: 6px 10px; display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0; min-width: 130px;';
            card.title = 'Click to sub into 5 on-court';
            card.onclick = () => this.substituteLiveTrackerPlayer(ath.id);

            const photoUrl = ath.photo || ath.photoData || null;
            let photoHtml = photoUrl
                ? `<img src="${photoUrl}" style="width: 28px; height: 28px; border-radius: 50%; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);">`
                : `<div style="width: 28px; height: 28px; border-radius: 50%; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 0.75rem; color: var(--accent-orange);">${ath.nickname ? ath.nickname[0] : (ath.fullName ? ath.fullName[0] : 'B')}</div>`;

            card.innerHTML = `
                ${photoHtml}
                <div style="font-size: 0.75rem; color: var(--text-secondary); white-space: nowrap; text-overflow: ellipsis; overflow: hidden;">
                    ${ath.nickname || ath.fullName} <small style="color: var(--text-muted);">#${ath.jerseyNumber || ''}</small>
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
            
            const athletes = window.Store.getAthletesOnly();
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

    handleLiveTrackerCardAction(athleteId, action) {
        if (!this.liveTracker) return;
        const stats = this.liveTracker.playerStats[athleteId] || { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, pm: 0, eff: 0 };
        const athletes = window.Store.getAthletesOnly();
        const ath = athletes.find(a => a.id === athleteId);
        const name = ath ? (ath.nickname || ath.fullName) : athleteId;

        let deltaPts = 0;
        let desc = '';

        if (action === '2') {
            stats.pts += 2;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg2m += 1;
            stats.fg2a += 1;
            deltaPts = 2;
            desc = `+2 PTS (2PT Made) by ${name}`;
        } else if (action === 'w' || action === 'c') {
            stats.fga += 1;
            stats.fg2a += 1;
            desc = `2PT Missed by ${name}`;
        } else if (action === '3') {
            stats.pts += 3;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg3m += 1;
            stats.fg3a += 1;
            deltaPts = 3;
            desc = `+3 PTS (3PT Made) by ${name}`;
        } else if (action === 'e' || action === 'v') {
            stats.fga += 1;
            stats.fg3a += 1;
            desc = `3PT Missed by ${name}`;
        } else if (action === '1' || action === 'f') {
            stats.pts += 1;
            stats.ftm += 1;
            stats.fta += 1;
            deltaPts = 1;
            desc = `+1 FT Made by ${name}`;
        } else if (action === 'g') {
            stats.fta += 1;
            desc = `FT Missed by ${name}`;
        } else if (action === 'r') {
            stats.reb += 1;
            desc = `Rebound by ${name}`;
        } else if (action === 'a') {
            stats.ast += 1;
            desc = `Assist by ${name}`;
        } else if (action === 's') {
            stats.stl += 1;
            desc = `Steal by ${name}`;
        } else if (action === 'b') {
            stats.blk += 1;
            desc = `Block by ${name}`;
        } else if (action === 't') {
            stats.to += 1;
            desc = `Turnover by ${name}`;
        } else if (action === 'x') {
            stats.pf += 1;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.teamFouls) this.liveTracker.teamFouls = {};
            this.liveTracker.teamFouls[qtr] = (this.liveTracker.teamFouls[qtr] || 0) + 1;
            desc = `Personal Foul (#${stats.pf}) by ${name}`;

            if (stats.pf >= 5) {
                window.WellnessModule.showToast(`⚠️ FOUL OUT! ${name} has 5 Personal Fouls!`, 'danger');
            } else if (stats.pf === 4) {
                window.WellnessModule.showToast(`⚠️ FOUL TROUBLE: ${name} has 4 Personal Fouls!`, 'warning');
            }
        }

        // Recalculate FIBA EFF: (PTS + REB + AST + STL + BLK) - ((FGA - FGM) + (FTA - FTM) + TO)
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

            // Increment +/- for all 5 active on-court players
            (this.liveTracker.onCourtIds || []).forEach(id => {
                if (this.liveTracker.playerStats[id]) {
                    this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) + deltaPts;
                }
            });
        }

        this.addLiveTrackerPbpEvent({
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            athleteId,
            action,
            deltaPts,
            text: desc
        });

        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    addLiveTrackerPbpEvent(evt) {
        if (!this.liveTracker.pbpEvents) this.liveTracker.pbpEvents = [];
        this.liveTracker.pbpEvents.unshift(evt);
        if (this.liveTracker.pbpEvents.length > 50) this.liveTracker.pbpEvents.pop();
    },

    handleLiveTrackerOpponentAction(action) {
        if (!this.liveTracker) return;
        if (!this.liveTracker.oppStats) {
            this.liveTracker.oppStats = { pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0 };
        }

        const oppName = this.liveTracker.oppName || 'Opponent';
        const stats = this.liveTracker.oppStats;
        let deltaPts = 0;
        let desc = '';

        if (action === '2') {
            deltaPts = 2;
            stats.pts += 2;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg2m += 1;
            stats.fg2a += 1;
            desc = `+2 PTS Made by ${oppName}`;
        } else if (action === 'w') {
            stats.fga += 1;
            stats.fg2a += 1;
            desc = `2PT Missed by ${oppName}`;
        } else if (action === '3') {
            deltaPts = 3;
            stats.pts += 3;
            stats.fgm += 1;
            stats.fga += 1;
            stats.fg3m += 1;
            stats.fg3a += 1;
            desc = `+3 PTS Made by ${oppName}`;
        } else if (action === 'e') {
            stats.fga += 1;
            stats.fg3a += 1;
            desc = `3PT Missed by ${oppName}`;
        } else if (action === '1') {
            deltaPts = 1;
            stats.pts += 1;
            stats.ftm += 1;
            stats.fta += 1;
            desc = `+1 FT Made by ${oppName}`;
        } else if (action === 'g') {
            stats.fta += 1;
            desc = `FT Missed by ${oppName}`;
        } else if (action === 'r') {
            stats.reb += 1;
            desc = `Rebound by ${oppName}`;
        } else if (action === 'a') {
            stats.ast += 1;
            desc = `Assist by ${oppName}`;
        } else if (action === 's') {
            stats.stl += 1;
            desc = `Steal by ${oppName}`;
        } else if (action === 'b') {
            stats.blk += 1;
            desc = `Block by ${oppName}`;
        } else if (action === 't') {
            stats.to += 1;
            desc = `Turnover by ${oppName}`;
        } else if (action === 'f') {
            stats.pf += 1;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.oppFouls) this.liveTracker.oppFouls = {};
            this.liveTracker.oppFouls[qtr] = (this.liveTracker.oppFouls[qtr] || 0) + 1;
            desc = `Personal Foul by ${oppName}`;
        }

        if (deltaPts > 0) {
            this.liveTracker.scoreOpp = (this.liveTracker.scoreOpp || 0) + deltaPts;
            const qtr = this.liveTracker.quarter || 'Q1';
            if (!this.liveTracker.quarterScores[qtr]) this.liveTracker.quarterScores[qtr] = { team: 0, opp: 0 };
            this.liveTracker.quarterScores[qtr].opp += deltaPts;

            // Decrement +/- for all 5 active on-court players
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

        events.forEach(evt => {
            const div = document.createElement('div');
            div.style = 'padding: 4px 8px; background: rgba(255,255,255,0.02); border-left: 3px solid var(--accent-blue); border-radius: 3px; display: flex; justify-content: space-between; align-items: center;';
            div.innerHTML = `
                <span><small style="color: var(--text-muted); font-family: monospace; margin-right: 6px;">[${evt.time}]</small> ${evt.text}</span>
                ${evt.deltaPts ? `<strong style="color: var(--accent-orange); font-family: monospace;">+${evt.deltaPts}</strong>` : ''}
            `;
            feed.appendChild(div);
        });
    },

    undoLiveTrackerAction() {
        if (!this.liveTracker || !this.liveTracker.pbpEvents || this.liveTracker.pbpEvents.length === 0) {
            window.WellnessModule.showToast('Nothing to undo.', 'info');
            return;
        }

        const lastEvt = this.liveTracker.pbpEvents.shift();
        if (lastEvt.athleteId && lastEvt.action) {
            const stats = this.liveTracker.playerStats[lastEvt.athleteId];
            if (stats) {
                if (lastEvt.action === '2') { stats.pts = Math.max(0, stats.pts - 2); stats.fgm = Math.max(0, stats.fgm - 1); stats.fga = Math.max(0, stats.fga - 1); }
                else if (lastEvt.action === 'w') { stats.fga = Math.max(0, stats.fga - 1); }
                else if (lastEvt.action === '3') { stats.pts = Math.max(0, stats.pts - 3); stats.fgm = Math.max(0, stats.fgm - 1); stats.fga = Math.max(0, stats.fga - 1); }
                else if (lastEvt.action === 'e') { stats.fga = Math.max(0, stats.fga - 1); }
                else if (lastEvt.action === '1' || lastEvt.action === 'f') { stats.pts = Math.max(0, stats.pts - 1); }
                else if (lastEvt.action === 'r') { stats.reb = Math.max(0, stats.reb - 1); }
                else if (lastEvt.action === 'a') { stats.ast = Math.max(0, stats.ast - 1); }
                else if (lastEvt.action === 's') { stats.stl = Math.max(0, stats.stl - 1); }
                else if (lastEvt.action === 'b') { stats.blk = Math.max(0, stats.blk - 1); }
                else if (lastEvt.action === 't') { stats.to = Math.max(0, stats.to - 1); }
                else if (lastEvt.action === 'x') { stats.pf = Math.max(0, stats.pf - 1); }

                let missedFg = stats.fga > stats.fgm ? (stats.fga - stats.fgm) : 0;
                stats.eff = (stats.pts + stats.reb + stats.ast + stats.stl + stats.blk) - (missedFg + stats.to);
            }
        }

        if (lastEvt.isOpponent && lastEvt.deltaPts) {
            this.liveTracker.scoreOpp = Math.max(0, (this.liveTracker.scoreOpp || 0) - lastEvt.deltaPts);
        } else if (lastEvt.deltaPts) {
            this.liveTracker.scoreTeam = Math.max(0, (this.liveTracker.scoreTeam || 0) - lastEvt.deltaPts);
        }

        window.WellnessModule.showToast(`Undid: ${lastEvt.text}`, 'warning');
        this.saveLiveTrackerSession();
        this.syncLiveTrackerUI();
    },

    handleLiveTrackerKeydown(e) {
        // Only run if live-tracker view is active
        const liveView = document.getElementById('live-tracker-view');
        if (!liveView || !liveView.classList.contains('active')) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        const key = e.key.toLowerCase();

        // Check for Opponent Hotkeys (e.g. 'o' prefix state or direct keys)
        if (key === 'o') {
            this._oppKeyPending = true;
            setTimeout(() => { this._oppKeyPending = false; }, 1500);
            return;
        }

        if (this._oppKeyPending) {
            this._oppKeyPending = false;
            if (['2', 'w', '3', 'e', '1', 'r', 'a', 's', 'b', 't', 'f'].includes(key)) {
                e.preventDefault();
                this.handleLiveTrackerOpponentAction(key);
                return;
            }
        }
        
        // 1. Player Selection Keys (Q, W, E, R, T or Shift+1..5)
        const playerKeyMap = { 'q': 0, 'w': 1, 'e': 2, 'r': 3, 't': 4 };
        if (!e.shiftKey && playerKeyMap.hasOwnProperty(key)) {
            const idx = playerKeyMap[key];
            const onCourt = this.liveTracker.onCourtIds || [];
            if (onCourt[idx]) {
                e.preventDefault();
                this.liveTracker.selectedAthleteId = onCourt[idx];
                this.syncLiveTrackerUI();
                return;
            }
        }
        if (e.shiftKey && ['1', '2', '3', '4', '5'].includes(key)) {
            const idx = parseInt(key) - 1;
            const onCourt = this.liveTracker.onCourtIds || [];
            if (onCourt[idx]) {
                e.preventDefault();
                this.liveTracker.selectedAthleteId = onCourt[idx];
                this.syncLiveTrackerUI();
                return;
            }
        }

        // 2. Action Keys for selected athlete (1=FT, 2=2PT, 3=3PT)
        const targetId = this.liveTracker.selectedAthleteId;
        if (!targetId) return;

        if (key === 'u' || (e.metaKey && key === 'z') || (e.ctrlKey && key === 'z')) {
            e.preventDefault();
            this.undoLiveTrackerAction();
        } else if (['1', '2', '3', 'w', 'e', 'f', 'g', 'r', 'a', 's', 'b', 't', 'x', 'c', 'v', 'k', 'd'].includes(key)) {
            e.preventDefault();
            this.handleLiveTrackerCardAction(targetId, key);
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
                const name = ath ? this.getAthleteDisplayName(ath) : id;
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
                        <td style="text-align: center;">${s.reb}</td>
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

        // Use scoreTeam/scoreOpp as primary PTS
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
            <!-- SIDE-BY-SIDE TEAM COMPARISON MATRIX -->
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

            <!-- OUR TEAM INDIVIDUAL BOX SCORE -->
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

    pushLiveTrackerToMatchLog() {
        if (!this.liveTracker) return;
        if (!this.checkAdminPermission()) return;

        const logs = JSON.parse(localStorage.getItem('atp_match_logs')) || [];
        const matchId = this.liveTracker.matchId;

        // Scrape active player stats matrix
        const playerStats = [];
        Object.keys(this.liveTracker.playerStats || {}).forEach(id => {
            const s = this.liveTracker.playerStats[id];
            if (s.pts > 0 || s.reb > 0 || s.ast > 0 || s.to > 0 || s.min > 0) {
                playerStats.push({
                    athleteId: id,
                    min: s.min || 0,
                    pts: s.pts || 0,
                    reb: s.reb || 0,
                    ast: s.ast || 0,
                    stl: s.stl || 0,
                    blk: s.blk || 0,
                    to: s.to || 0,
                    pf: s.pf || 0,
                    fgm: s.fgm || 0,
                    fga: s.fga || 0,
                    plusMinus: s.pm || 0,
                    eff: s.eff || 0
                });
            }
        });

        const newGameRound = {
            stage: this.liveTracker.quarter || 'Group Stage',
            opponent: this.liveTracker.oppName || 'Opponent',
            scoreAtp: this.liveTracker.scoreTeam || 0,
            scoreOpp: this.liveTracker.scoreOpp || 0,
            stats: `Live Tracker Session: ${this.liveTracker.teamName} vs ${this.liveTracker.oppName}`,
            notes: `Recorded via Live Stat Tracker Console`,
            playerStats
        };

        if (matchId !== 'new') {
            const index = logs.findIndex(l => l.id === matchId);
            if (index > -1) {
                if (!logs[index].games) logs[index].games = [];
                logs[index].games.push(newGameRound);
                logs[index].atpScore = (logs[index].atpScore || 0) + newGameRound.scoreAtp;
                logs[index].oppScore = (logs[index].oppScore || 0) + newGameRound.scoreOpp;
                localStorage.setItem('atp_match_logs', JSON.stringify(logs));
                window.WellnessModule.showToast(`Pushed game round to ${logs[index].title}!`, 'success');
            }
        } else {
            const newMatch = {
                id: 'match_log_' + Date.now(),
                title: `${this.liveTracker.teamName} vs ${this.liveTracker.oppName}`,
                opponent: this.liveTracker.oppName || 'Opponent',
                date: window.Store.getLocalDateString(),
                endDate: window.Store.getLocalDateString(),
                atpScore: newGameRound.scoreAtp,
                oppScore: newGameRound.scoreOpp,
                notes: 'Created via Live Stat Tracker',
                ageCategory: 'U18',
                format: '5x5',
                mode: 'team',
                attendedAthleteIds: (this.liveTracker.onCourtIds || []),
                attendedStaffIds: [],
                games: [newGameRound]
            };
            logs.push(newMatch);
            localStorage.setItem('atp_match_logs', JSON.stringify(logs));
            window.WellnessModule.showToast('New Match Log created from Live Session!', 'success');
        }

        // Reset live session after saving
        localStorage.removeItem('atp_live_tracker_session');
        this.resetLiveTrackerState();
        this.switchView('match-log');
    },

    // ═══════════════════════════════════════════════════════════════════════
    //  WEIGHT ROOM BIG SCREEN LAYOUT RENDERER
    // ═══════════════════════════════════════════════════════════════════════
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

document.addEventListener('DOMContentLoaded', () => {
    window.App = App;
    App.init();

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
