const WorkoutModule = {
    currentWorkout: null,
    timerInterval: null,
    timerSeconds: 90,
    timerRunning: false,
    timerTotal: 90,
    audioContext: null,

    init() {
        this.cacheDOM();
        this.bindEvents();
        this.loadWorkoutList();
        this.createNewWorkout(); // Start with a blank canvas for today
    },

    cacheDOM() {
        this.workoutListContainer = document.getElementById('workout-list');
        this.newWorkoutBtn = document.getElementById('new-workout-btn');
        this.saveWorkoutBtn = document.getElementById('save-workout-btn');
        this.deleteWorkoutBtn = document.getElementById('delete-workout-btn');
        
        this.workoutNameInput = document.getElementById('workout-name');
        this.workoutDateInput = document.getElementById('workout-date');
        this.exercisesContainer = document.getElementById('workout-exercises');
        this.exerciseSearchInput = document.getElementById('exercise-search-input');
        this.addExerciseSelect = document.getElementById('add-exercise-select');
        this.addExerciseBtn = document.getElementById('add-exercise-btn');
        
        // Rest Timer DOM
        this.timerOverlay = document.getElementById('timer-overlay');
        this.timerCountDisplay = document.getElementById('timer-count');
        this.timerToggleBtn = document.getElementById('timer-toggle');
        this.timerResetBtn = document.getElementById('timer-reset');
        this.timerCloseBtn = document.getElementById('timer-close');
    },

    bindEvents() {
        if (this.newWorkoutBtn) {
            this.newWorkoutBtn.addEventListener('click', () => {
                this.createNewWorkout();
            });
        }

        if (this.saveWorkoutBtn) {
            this.saveWorkoutBtn.addEventListener('click', () => {
                this.saveWorkout();
            });
        }

        if (this.deleteWorkoutBtn) {
            this.deleteWorkoutBtn.addEventListener('click', () => {
                this.deleteWorkout();
            });
        }

        if (this.addExerciseBtn) {
            this.addExerciseBtn.addEventListener('click', () => {
                this.addExerciseToWorkout();
            });
        }

        if (this.exerciseSearchInput) {
            this.exerciseSearchInput.addEventListener('input', (e) => {
                this.populateExerciseSelect(e.target.value);
            });
        }

        // Timer Events
        if (this.timerToggleBtn) {
            this.timerToggleBtn.addEventListener('click', () => this.toggleTimer());
        }
        if (this.timerResetBtn) {
            this.timerResetBtn.addEventListener('click', () => this.resetTimer());
        }
        if (this.timerCloseBtn) {
            this.timerCloseBtn.addEventListener('click', () => this.hideTimer());
        }
    },

    populateExerciseSelect(filterQuery = '') {
        if (!this.addExerciseSelect) return;
        
        const exercises = window.Store.getExercises();
        this.addExerciseSelect.innerHTML = '<option value="">-- Select Exercise --</option>';
        
        const query = filterQuery.toLowerCase().trim();
        const filtered = exercises.filter(ex => 
            ex.name.toLowerCase().includes(query) || 
            ex.category.toLowerCase().includes(query)
        );
        
        // Group by category
        const categories = {};
        filtered.forEach(ex => {
            if (!categories[ex.category]) {
                categories[ex.category] = [];
            }
            categories[ex.category].push(ex);
        });

        for (const cat in categories) {
            const group = document.createElement('optgroup');
            group.label = cat;
            categories[cat].forEach(ex => {
                const opt = document.createElement('option');
                opt.value = ex.id;
                opt.textContent = ex.name;
                group.appendChild(opt);
            });
            this.addExerciseSelect.appendChild(group);
        }
    },

    loadWorkoutList() {
        if (!this.workoutListContainer) return;
        
        const activeAthleteId = window.App ? window.App.currentAthleteId : null;
        if (!activeAthleteId) {
            this.workoutListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">No athlete selected</div>';
            return;
        }
        
        const workouts = window.Store.getWorkouts(activeAthleteId);
        // Sort by date descending
        workouts.sort((a, b) => new Date(b.date) - new Date(a.date));
        
        this.workoutListContainer.innerHTML = '';
        
        if (workouts.length === 0) {
            this.workoutListContainer.innerHTML = '<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px; text-align: center;">No workouts logged</div>';
            return;
        }

        workouts.forEach(workout => {
            const item = document.createElement('div');
            item.className = 'workout-item';
            if (this.currentWorkout && this.currentWorkout.id === workout.id) {
                item.className += ' active';
            }
            
            const totalVol = window.Store.calculateTotalVolume(workout);
            
            item.innerHTML = `
                <div class="workout-item-title">${workout.name || 'Untitled Workout'}</div>
                <div class="workout-item-date">${workout.date} • Vol: ${totalVol.toLocaleString()} kg</div>
            `;
            
            item.addEventListener('click', () => {
                this.loadWorkout(workout.id);
            });
            
            this.workoutListContainer.appendChild(item);
        });
    },

    createNewWorkout() {
        const activeAthleteId = window.App ? window.App.currentAthleteId : null;
        if (!activeAthleteId) {
            this.currentWorkout = null;
            this.renderWorkout();
            return;
        }
        this.currentWorkout = {
            id: 'workout_' + Date.now(),
            athleteId: activeAthleteId,
            name: 'Workout ' + new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            date: window.Store.getLocalDateString(),
            exercises: []
        };
        
        this.renderWorkout();
        this.populateExerciseSelect();
        this.loadWorkoutList(); // Highlight state refresh
    },

    loadWorkout(id) {
        const workout = window.Store.getWorkoutById(id);
        if (workout) {
            this.currentWorkout = JSON.parse(JSON.stringify(workout)); // deep copy to edit safely
            this.renderWorkout();
            this.populateExerciseSelect();
            this.loadWorkoutList();
        }
    },

    renderWorkout() {
        if (!this.currentWorkout) {
            this.exercisesContainer.innerHTML = `
                <div style="text-align: center; padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--border-radius-lg); background: rgba(255,255,255,0.01);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px;">👤</div>
                    <h3 style="margin-bottom: 6px;">No Athlete Selected</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Please select or add an athlete from the top roster dropdown.</p>
                </div>
            `;
            if (this.workoutNameInput) this.workoutNameInput.value = '';
            if (this.workoutDateInput) this.workoutDateInput.value = '';
            return;
        }
        
        this.workoutNameInput.value = this.currentWorkout.name;
        this.workoutDateInput.value = this.currentWorkout.date;
        
        this.exercisesContainer.innerHTML = '';
        
        if (this.currentWorkout.exercises.length === 0) {
            this.exercisesContainer.innerHTML = `
                <div style="text-align: center; padding: 48px; border: 1px dashed var(--border-color); border-radius: var(--border-radius-lg); background: rgba(255,255,255,0.01);">
                    <div style="font-size: 2.5rem; margin-bottom: 12px;">🏋️‍♂️</div>
                    <h3 style="margin-bottom: 6px;">Empty Workout Program</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem;">Select an exercise from the dropdown to add it to your program.</p>
                </div>
            `;
            return;
        }

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

        this.bindWorkoutInputs();
    },

    bindWorkoutInputs() {
        // Workout name and date
        this.workoutNameInput.oninput = (e) => {
            this.currentWorkout.name = e.target.value;
        };
        this.workoutDateInput.onchange = (e) => {
            this.currentWorkout.date = e.target.value;
        };

        // Exercise-level Group/Superset labels
        document.querySelectorAll('.ex-group-label').forEach(input => {
            input.oninput = (e) => {
                const exIndex = e.target.dataset.ex;
                this.currentWorkout.exercises[exIndex].groupLabel = e.target.value;
            };
        });

        // Move Up button
        document.querySelectorAll('.move-up-btn').forEach(btn => {
            btn.onclick = (e) => {
                const exIndex = parseInt(e.currentTarget.dataset.ex);
                if (exIndex > 0) {
                    const temp = this.currentWorkout.exercises[exIndex];
                    this.currentWorkout.exercises[exIndex] = this.currentWorkout.exercises[exIndex - 1];
                    this.currentWorkout.exercises[exIndex - 1] = temp;
                    this.renderWorkout();
                }
            };
        });

        // Move Down button
        document.querySelectorAll('.move-down-btn').forEach(btn => {
            btn.onclick = (e) => {
                const exIndex = parseInt(e.currentTarget.dataset.ex);
                if (exIndex < this.currentWorkout.exercises.length - 1) {
                    const temp = this.currentWorkout.exercises[exIndex];
                    this.currentWorkout.exercises[exIndex] = this.currentWorkout.exercises[exIndex + 1];
                    this.currentWorkout.exercises[exIndex + 1] = temp;
                    this.renderWorkout();
                }
            };
        });

        // Exercise-level prescription inputs
        document.querySelectorAll('.ex-tempo').forEach(input => {
            input.oninput = (e) => {
                const exIndex = e.target.dataset.ex;
                this.currentWorkout.exercises[exIndex].tempo = e.target.value;
            };
        });

        document.querySelectorAll('.ex-rest-interval').forEach(select => {
            select.onchange = (e) => {
                const exIndex = e.target.dataset.ex;
                this.currentWorkout.exercises[exIndex].restInterval = e.target.value;
            };
        });

        document.querySelectorAll('.ex-target-rpe').forEach(input => {
            input.oninput = (e) => {
                const exIndex = e.target.dataset.ex;
                this.currentWorkout.exercises[exIndex].targetRpe = e.target.value;
            };
        });

        // Inputs within exercise tables
        document.querySelectorAll('.set-target-reps').forEach(input => {
            input.oninput = (e) => {
                const { ex, set } = e.target.dataset;
                this.currentWorkout.exercises[ex].sets[set].targetReps = parseInt(e.target.value) || null;
            };
        });

        document.querySelectorAll('.set-weight').forEach(input => {
            input.oninput = (e) => {
                const { ex, set } = e.target.dataset;
                this.currentWorkout.exercises[ex].sets[set].weight = parseFloat(e.target.value) || 0;
                this.updateRowE1RM(ex, set);
            };
        });

        document.querySelectorAll('.set-reps').forEach(input => {
            input.oninput = (e) => {
                const { ex, set } = e.target.dataset;
                this.currentWorkout.exercises[ex].sets[set].reps = parseInt(e.target.value) || 0;
                this.updateRowE1RM(ex, set);
            };
        });

        document.querySelectorAll('.set-rpe').forEach(input => {
            input.oninput = (e) => {
                const { ex, set } = e.target.dataset;
                this.currentWorkout.exercises[ex].sets[set].rpe = parseInt(e.target.value) || null;
            };
        });

        document.querySelectorAll('.set-completed').forEach(checkbox => {
            checkbox.onchange = (e) => {
                const { ex, set } = e.target.dataset;
                const exIndex = ex;
                const completed = e.target.checked;
                this.currentWorkout.exercises[ex].sets[set].completed = completed;
                
                if (completed) {
                    this.startRestTimer(exIndex);
                }
            };
        });

        // Add set button
        document.querySelectorAll('.add-set-btn').forEach(btn => {
            btn.onclick = (e) => {
                const exIndex = e.currentTarget.dataset.ex;
                const sets = this.currentWorkout.exercises[exIndex].sets;
                
                // Copy last set values if exists, else defaults
                const lastSet = sets[sets.length - 1];
                sets.push({
                    targetReps: lastSet ? lastSet.targetReps : null,
                    weight: lastSet ? lastSet.weight : null,
                    reps: lastSet ? lastSet.reps : null,
                    rpe: lastSet ? lastSet.rpe : null,
                    completed: false
                });
                
                this.renderWorkout();
            };
        });

        // Remove set button
        document.querySelectorAll('.remove-set-btn').forEach(btn => {
            btn.onclick = (e) => {
                const { ex, set } = e.currentTarget.dataset;
                this.currentWorkout.exercises[ex].sets.splice(set, 1);
                this.renderWorkout();
            };
        });

        // Remove exercise button
        document.querySelectorAll('.remove-exercise-btn').forEach(btn => {
            btn.onclick = (e) => {
                const exIndex = e.currentTarget.dataset.ex;
                this.currentWorkout.exercises.splice(exIndex, 1);
                this.renderWorkout();
            };
        });
    },

    updateRowE1RM(exIndex, setIndex) {
        const td = document.querySelector(`.set-e1rm[data-ex="${exIndex}"][data-set="${setIndex}"]`);
        if (td) {
            const set = this.currentWorkout.exercises[exIndex].sets[setIndex];
            const e1rm = (set.weight && set.reps) ? window.Store.estimateOneRepMax(set.weight, set.reps) : 0;
            td.textContent = e1rm ? `${e1rm} kg` : '-';
        }
    },

    addExerciseToWorkout() {
        if (!this.addExerciseSelect) return;
        const selectedId = this.addExerciseSelect.value;
        if (!selectedId) return;

        const exercises = window.Store.getExercises();
        const ex = exercises.find(e => e.id === selectedId);
        
        if (ex) {
            this.currentWorkout.exercises.push({
                exerciseId: ex.id,
                name: ex.name,
                tempo: '',
                restInterval: '90s',
                targetRpe: '',
                groupLabel: '',
                sets: [
                    { targetReps: null, weight: null, reps: null, rpe: null, completed: false }
                ]
            });
            this.renderWorkout();
            this.addExerciseSelect.value = ''; // Reset select
            if (this.exerciseSearchInput) this.exerciseSearchInput.value = ''; // Reset search input
            this.populateExerciseSelect(); // Repopulate default list
        }
    },

    saveWorkout() {
        if (!this.currentWorkout) return;
        
        if (!this.currentWorkout.name.trim()) {
            this.showToast('Please enter a workout name', 'danger');
            return;
        }

        this.currentWorkout.athleteId = window.App.currentAthleteId;
        window.Store.saveWorkout(this.currentWorkout);
        this.showToast('Workout saved successfully!', 'success');
        
        this.loadWorkoutList();
        
        if (window.App) {
            window.App.updateDashboard();
        }
    },

    deleteWorkout() {
        if (window.App && typeof window.App.checkAdminPermission === 'function') {
            if (!window.App.checkAdminPermission()) return;
        }
        if (!this.currentWorkout) return;
        
        if (confirm('Are you sure you want to delete this workout?')) {
            window.Store.deleteWorkout(this.currentWorkout.id);
            this.showToast('Workout deleted successfully', 'info');
            this.createNewWorkout();
        }
    },

    // Rest Timer Logic
    _parseRestInterval(val) {
        const v = (val || '90s').trim().toLowerCase();
        if (v.endsWith('min')) return parseInt(v) * 60;
        if (v.endsWith('s')) return parseInt(v);
        return 90; // fallback
    },

    startRestTimer(exIndex) {
        if (window.App && window.App.getAudioContext) {
            window.App.getAudioContext();
        }

        clearInterval(this.timerInterval);

        // Determine rest duration from exercise's restInterval field
        let restSec = 90;
        if (exIndex != null && this.currentWorkout && this.currentWorkout.exercises[exIndex]) {
            restSec = this._parseRestInterval(this.currentWorkout.exercises[exIndex].restInterval);
        }

        this.timerSeconds = restSec;
        this.timerTotal = restSec;
        this.timerRunning = true;
        
        this.updateTimerUI();
        this.timerOverlay.classList.add('active');

        this.timerInterval = setInterval(() => {
            if (this.timerRunning) {
                this.timerSeconds--;
                this.updateTimerUI();

                if (this.timerSeconds <= 0) {
                    clearInterval(this.timerInterval);
                    this.playBeep();
                    this.hideTimer();
                }
            }
        }, 1000);
    },

    updateTimerUI() {
        const mins = Math.floor(this.timerSeconds / 60);
        const secs = this.timerSeconds % 60;
        this.timerCountDisplay.textContent = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        
        // Update control button icon
        const icon = this.timerToggleBtn.querySelector('i');
        if (this.timerRunning) {
            icon.className = 'fas fa-pause';
        } else {
            icon.className = 'fas fa-play';
        }
    },

    toggleTimer() {
        this.timerRunning = !this.timerRunning;
        this.updateTimerUI();
    },

    resetTimer() {
        this.timerSeconds = this.timerTotal;
        this.updateTimerUI();
    },

    hideTimer() {
        clearInterval(this.timerInterval);
        this.timerOverlay.classList.remove('active');
    },

    playBeep() {
        // Dynamic HTML5 synthesized audio beep
        try {
            const context = (window.App && window.App.getAudioContext)
                ? window.App.getAudioContext()
                : new (window.AudioContext || window.webkitAudioContext)();
            const osc = context.createOscillator();
            const gain = context.createGain();
            
            osc.connect(gain);
            gain.connect(context.destination);
            
            osc.frequency.setValueAtTime(880, context.currentTime); // High pitch A5
            gain.gain.setValueAtTime(0.1, context.currentTime);
            
            osc.start();
            osc.stop(context.currentTime + 0.3); // 300ms beep
        } catch (e) {
            console.log('Audio error:', e);
        }
    },

    showToast(message, type) {
        if (window.WellnessModule) {
            window.WellnessModule.showToast(message, type);
        }
    }
};

window.WorkoutModule = WorkoutModule;
