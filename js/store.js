// =============================================================================
//  SUPABASE CLOUD SYNC INITIALIZATION
// =============================================================================
(function() {
    const supabaseUrl = 'https://ymwmbszfbhptifevhvul.supabase.co';
    const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inltd21ic3pmYmhwdGlmZXZodnVsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNjYyMjgsImV4cCI6MjA5Njg0MjIyOH0.qtC-4uHhPXJCCuLHZAFOTM-OBs-mfhLGIyUndjunrFY';
    
    // Always bind original setItem to localStorage instance first
    const originalSetItem = localStorage.setItem.bind(localStorage);
    window.originalLocalStorageSetItem = originalSetItem;

    window.syncStatus = { status: 'connecting', message: 'Connecting to Cloud...' };

    if (window.supabase) {
        window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);
        
        // Hook into localStorage.setItem to auto-sync to Supabase in background
        localStorage.setItem = function(key, value) {
            originalSetItem(key, value);
            
            if (key.startsWith('personal_ams_') || key.startsWith('atp_')) {
                let parsedValue;
                try {
                    parsedValue = JSON.parse(value);
                } catch (e) {
                    parsedValue = value;
                }
                
                window.supabaseClient
                    .from('atp_ams_store')
                    .upsert({ key: key, value: parsedValue })
                    .then(({ error }) => {
                        if (error) {
                            console.error('Supabase Sync Error:', error);
                            if (error.code === '42501') {
                                window.syncStatus = { status: 'locked', message: 'RLS Permission Denied' };
                            } else {
                                window.syncStatus = { status: 'error', message: error.message || 'Sync Error' };
                            }
                            if (window.updateSyncUI) window.updateSyncUI();
                        } else {
                            window.syncStatus = { status: 'connected', message: 'Synced with Supabase Cloud' };
                            if (window.updateSyncUI) window.updateSyncUI();
                        }
                    })
                    .catch(err => {
                        console.error('Supabase Network Error:', err);
                        window.syncStatus = { status: 'error', message: 'Network Error' };
                        if (window.updateSyncUI) window.updateSyncUI();
                    });
            }
        };
    }

    // Helper to pull/push data from Supabase into localStorage on start
    window.syncFromSupabase = async function() {
        if (!window.supabaseClient) {
            window.syncStatus = { status: 'error', message: 'Supabase Client not loaded' };
            if (window.updateSyncUI) window.updateSyncUI();
            return false;
        }

        window.syncStatus = { status: 'connecting', message: 'Connecting to Cloud...' };
        if (window.updateSyncUI) window.updateSyncUI();

        try {
            const { data, error } = await window.supabaseClient
                .from('atp_ams_store')
                .select('*');

            if (error) {
                console.error('Failed to fetch from Supabase:', error);
                if (error.code === '42501') {
                    window.syncStatus = { status: 'locked', message: 'RLS Permission Denied' };
                } else {
                    window.syncStatus = { status: 'error', message: error.message || 'Fetch Failed' };
                }
                if (window.updateSyncUI) window.updateSyncUI();
                return false;
            }

            // Helper function to merge JSON data arrays
            function mergeData(key, localValStr, remoteValStr) {
                try {
                    const local = JSON.parse(localValStr);
                    const remote = JSON.parse(remoteValStr);
                    
                    if (!Array.isArray(local) || !Array.isArray(remote)) {
                        // If one is not an array, remote (cloud) wins as standard fallback
                        return remoteValStr;
                    }
                    
                    if (key.endsWith('athletes')) {
                        // Merge athletes by id
                        const merged = [...local];
                        remote.forEach(r => {
                            const lIdx = merged.findIndex(l => l.id === r.id);
                            if (lIdx === -1) {
                                merged.push(r);
                            } else {
                                // Merge performance logs
                                const localLogs = merged[lIdx].performanceLogs || [];
                                const remoteLogs = r.performanceLogs || [];
                                const mergedLogs = [...localLogs];
                                remoteLogs.forEach(rl => {
                                    if (!mergedLogs.some(ll => ll.date === rl.date)) {
                                        mergedLogs.push(rl);
                                    }
                                });
                                mergedLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
                                merged[lIdx].performanceLogs = mergedLogs;
                                
                                // Keep photo if local is null
                                if (!merged[lIdx].photo && r.photo) merged[lIdx].photo = r.photo;
                                // Keep team or fullName if local is empty
                                if (!merged[lIdx].fullName && r.fullName) merged[lIdx].fullName = r.fullName;
                            }
                        });
                        return JSON.stringify(merged);
                    }
                    
                    if (key.endsWith('workouts')) {
                        const merged = [...local];
                        remote.forEach(r => {
                            if (!merged.some(l => l.id === r.id)) {
                                merged.push(r);
                            }
                        });
                        return JSON.stringify(merged);
                    }
                    
                    if (key.endsWith('wellness')) {
                        const merged = [...local];
                        remote.forEach(r => {
                            if (!merged.some(l => l.athleteId === r.athleteId && l.date === r.date)) {
                                merged.push(r);
                            }
                        });
                        return JSON.stringify(merged);
                    }
                    
                    if (key.endsWith('exercises')) {
                        const merged = [...local];
                        remote.forEach(r => {
                            if (!merged.some(l => l.name.toLowerCase() === r.name.toLowerCase())) {
                                merged.push(r);
                            }
                        });
                        return JSON.stringify(merged);
                    }
                    
                    if (key.endsWith('recon_cases') || key.endsWith('recon_logs') || key.endsWith('periodization_matches') || key.endsWith('periodization_phases') || key.endsWith('master_programs') || key.endsWith('match_logs')) {
                        const merged = [...local];
                        remote.forEach(r => {
                            if (!merged.some(l => l.id === r.id)) {
                                merged.push(r);
                            }
                        });
                        return JSON.stringify(merged);
                    }
                    
                    return remoteValStr;
                } catch (e) {
                    console.error('Error merging key ' + key + ':', e);
                    return remoteValStr;
                }
            }

            // Two-Way Sync Logic:
            // 1. Identify local keys to push (which are missing in Supabase)
            const localKeys = Object.keys(localStorage).filter(k => k.startsWith('personal_ams_') || k.startsWith('atp_'));
            const remoteKeysMap = new Map(data ? data.map(row => [row.key, row.value]) : []);
            
            let keysToPush = [];
            let keysToPull = [];
            let keysToPushBack = [];
            
            localKeys.forEach(key => {
                const localVal = localStorage.getItem(key);
                if (!remoteKeysMap.has(key)) {
                    // Local exists but remote doesn't -> Needs to be pushed to Cloud
                    keysToPush.push(key);
                } else {
                    // Both exist. Let's compare and merge.
                    const remoteValStr = typeof remoteKeysMap.get(key) === 'string' ? remoteKeysMap.get(key) : JSON.stringify(remoteKeysMap.get(key));
                    if (localVal !== remoteValStr) {
                        const mergedValStr = mergeData(key, localVal, remoteValStr);
                        if (localVal !== mergedValStr) {
                            keysToPull.push({ key, valueStr: mergedValStr });
                        }
                        if (remoteValStr !== mergedValStr) {
                            keysToPushBack.push({ key, valueStr: mergedValStr });
                        }
                    }
                }
            });
            
            // Remote keys that don't exist locally at all should be pulled
            remoteKeysMap.forEach((val, key) => {
                if (localStorage.getItem(key) === null) {
                    const remoteValStr = typeof val === 'string' ? val : JSON.stringify(val);
                    keysToPull.push({ key, valueStr: remoteValStr });
                }
            });
            
            // Process push of missing local keys
            if (keysToPush.length > 0) {
                console.log(`Pushing ${keysToPush.length} local keys to Supabase...`, keysToPush);
                for (const key of keysToPush) {
                    const val = localStorage.getItem(key);
                    let parsedValue;
                    try { parsedValue = JSON.parse(val); } catch (e) { parsedValue = val; }
                    
                    const { error: pushErr } = await window.supabaseClient
                        .from('atp_ams_store')
                        .upsert({ key: key, value: parsedValue });
                    if (pushErr) {
                        console.error(`Error pushing key ${key} to Supabase:`, pushErr);
                        if (pushErr.code === '42501') {
                            window.syncStatus = { status: 'locked', message: 'RLS Permission Denied' };
                            if (window.updateSyncUI) window.updateSyncUI();
                            return false;
                        }
                    }
                }
            }

            // Process pushing back merged values that changed remote
            if (keysToPushBack.length > 0) {
                console.log(`Pushing back ${keysToPushBack.length} merged keys to Supabase...`, keysToPushBack);
                for (const item of keysToPushBack) {
                    let parsedValue;
                    try { parsedValue = JSON.parse(item.valueStr); } catch (e) { parsedValue = item.valueStr; }
                    
                    const { error: pushErr } = await window.supabaseClient
                        .from('atp_ams_store')
                        .upsert({ key: item.key, value: parsedValue });
                    if (pushErr) {
                        console.error(`Error pushing merged key ${item.key} to Supabase:`, pushErr);
                    }
                }
            }
            
            // Process pull of remote keys
            let updated = false;
            if (keysToPull.length > 0) {
                console.log(`Pulling ${keysToPull.length} remote keys from Supabase...`);
                keysToPull.forEach(item => {
                    window.originalLocalStorageSetItem(item.key, item.valueStr);
                    updated = true;
                });
            }
            
            window.syncStatus = { status: 'connected', message: 'Synced with Supabase Cloud' };
            if (window.updateSyncUI) window.updateSyncUI();
            return updated;
        } catch (e) {
            console.error('Supabase initial sync error:', e);
            window.syncStatus = { status: 'error', message: e.message || 'Network error' };
            if (window.updateSyncUI) window.updateSyncUI();
        }
        return false;
    };
})();

// LocalStorage keys
const STORAGE_KEYS = {
    WORKOUTS: 'personal_ams_workouts',
    WELLNESS: 'personal_ams_wellness',
    EXERCISES: 'personal_ams_exercises',
    ATHLETES: 'personal_ams_athletes',
    PERIODIZATION_MATCHES: 'personal_ams_periodization_matches',
    PERIODIZATION_PHASES: 'personal_ams_periodization_phases',
    CUSTOM_TESTS: 'personal_ams_custom_tests'
};

// 🏋️‍♂️ Massive Professional S&C Exercise Library Database
const DEFAULT_EXERCISES = [
    // ─── Mobility (5) ───
    { id: '1',  name: '90/90 Hip Distraction',               category: 'Mobility',       primaryMuscle: 'Hip Mobility' },
    { id: '2',  name: 'Thoracic Extension on Foam Roller',   category: 'Mobility',       primaryMuscle: 'T-Spine' },
    { id: '3',  name: "World's Greatest Stretch",            category: 'Mobility',       primaryMuscle: 'Full Body' },
    { id: '4',  name: 'Banded Shoulder Distraction',         category: 'Mobility',       primaryMuscle: 'Shoulder' },
    { id: '5',  name: 'Deep Squat Hold with Rotation',       category: 'Mobility',       primaryMuscle: 'Ankle/Hip' },

    // ─── Core (5) ───
    { id: '6',  name: 'RKC Plank',                           category: 'Core',           primaryMuscle: 'Anterior Core' },
    { id: '7',  name: 'Pallof Press',                        category: 'Core',           primaryMuscle: 'Anti-Rotation' },
    { id: '8',  name: 'Hanging Knee Raise',                  category: 'Core',           primaryMuscle: 'Lower Abs' },
    { id: '9',  name: 'Ab Wheel Rollout',                    category: 'Core',           primaryMuscle: 'Anterior Core' },
    { id: '10', name: 'Dead Bug',                            category: 'Core',           primaryMuscle: 'Core Stability' },

    // ─── Upper Body (6) ───
    { id: '11', name: 'Barbell Bench Press',                 category: 'Upper Body',     primaryMuscle: 'Chest' },
    { id: '12', name: 'Incline Dumbbell Press',              category: 'Upper Body',     primaryMuscle: 'Upper Chest' },
    { id: '13', name: 'Pull-up',                             category: 'Upper Body',     primaryMuscle: 'Lats' },
    { id: '14', name: 'Chest Supported Row',                 category: 'Upper Body',     primaryMuscle: 'Mid Back' },
    { id: '15', name: 'Overhead Press',                      category: 'Upper Body',     primaryMuscle: 'Shoulders' },
    { id: '16', name: 'Dumbbell Lateral Raise',              category: 'Upper Body',     primaryMuscle: 'Lateral Deltoid' },

    // ─── Lower Body (6) ───
    { id: '17', name: 'Barbell Back Squat',                  category: 'Lower Body',     primaryMuscle: 'Quads' },
    { id: '18', name: 'Trap Bar Deadlift',                   category: 'Lower Body',     primaryMuscle: 'Posterior Chain' },
    { id: '19', name: 'Bulgarian Split Squat',               category: 'Lower Body',     primaryMuscle: 'Quads/Glutes' },
    { id: '20', name: 'Romanian Deadlift',                   category: 'Lower Body',     primaryMuscle: 'Hamstrings' },
    { id: '21', name: 'Leg Press',                           category: 'Lower Body',     primaryMuscle: 'Quads' },
    { id: '22', name: 'Nordic Hamstring Curl',               category: 'Lower Body',     primaryMuscle: 'Hamstrings' },

    // ─── Power (4) ───
    { id: '23', name: 'Hang Power Clean',                    category: 'Power',          primaryMuscle: 'Full Body Power' },
    { id: '24', name: 'Dumbbell Snatch',                     category: 'Power',          primaryMuscle: 'Unilateral Power' },
    { id: '25', name: 'Medicine Ball Underhand Launch',      category: 'Power',          primaryMuscle: 'Hip Extension Power' },
    { id: '26', name: 'Push Press',                          category: 'Power',          primaryMuscle: 'Upper Body Power' },

    // ─── Plyometrics (4) ───
    { id: '27', name: 'Depth Jump',                          category: 'Plyometrics',    primaryMuscle: 'Reactive Strength' },
    { id: '28', name: 'Continuous Broad Jumps',              category: 'Plyometrics',    primaryMuscle: 'Horizontal Power' },
    { id: '29', name: 'Single-Leg Box Drop',                 category: 'Plyometrics',    primaryMuscle: 'Landing Mechanics' },
    { id: '30', name: 'Lateral Bound',                       category: 'Plyometrics',    primaryMuscle: 'Frontal Plane Power' },

    // ─── Circuit / MetCon (4) ───
    { id: '31', name: 'Assault Bike Sprint',                 category: 'Circuit/MetCon', primaryMuscle: 'Conditioning' },
    { id: '32', name: 'Kettlebell Swing',                    category: 'Circuit/MetCon', primaryMuscle: 'Hip Hinge Power Endurance' },
    { id: '33', name: "Dumbbell Farmer's Walk",              category: 'Circuit/MetCon', primaryMuscle: 'Grip/Core' },
    { id: '34', name: 'Battle Rope Alternating Waves',       category: 'Circuit/MetCon', primaryMuscle: 'Upper Body Endurance' }
];

const Store = {
    getLocalDateString(date = new Date()) {
        const d = new Date(date);
        const offset = d.getTimezoneOffset();
        const localDate = new Date(d.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
    },

    init() {
        // บังคับรีเซ็ต Exercises ทุกครั้งโดยผสมผสานท่าพื้นฐานเพื่อรักษาความเสถียร
        if (!localStorage.getItem(STORAGE_KEYS.EXERCISES)) {
            localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(DEFAULT_EXERCISES));
        } else {
            const currentEx = JSON.parse(localStorage.getItem(STORAGE_KEYS.EXERCISES)) || [];
            DEFAULT_EXERCISES.forEach(defEx => {
                if (!currentEx.some(ex => ex.name.toLowerCase() === defEx.name.toLowerCase())) {
                    currentEx.push(defEx);
                }
            });
            localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(currentEx));
        }
        
        if (!localStorage.getItem(STORAGE_KEYS.ATHLETES)) {
            localStorage.setItem(STORAGE_KEYS.ATHLETES, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.WORKOUTS)) {
            localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.WELLNESS)) {
            localStorage.setItem(STORAGE_KEYS.WELLNESS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.PERIODIZATION_PHASES)) {
            localStorage.setItem(STORAGE_KEYS.PERIODIZATION_PHASES, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.PERIODIZATION_MATCHES)) {
            localStorage.setItem(STORAGE_KEYS.PERIODIZATION_MATCHES, JSON.stringify([]));
        }
        
        this.seedInitialDataIfEmpty();
    },

    seedInitialDataIfEmpty() {
        const athletes = this.getAthletes();
        
        // Smart conditional check: check if the three key mock athletes are already populated
        const hasAthlete1 = athletes.some(a => a.id === 'athlete_1');
        const hasAthlete2 = athletes.some(a => a.id === 'athlete_2');
        const hasAthlete3 = athletes.some(a => a.id === 'athlete_3');
        
        if (hasAthlete1 && hasAthlete2 && hasAthlete3) return; // DB populated already

        const today = new Date();
        const dateString = (offset) => {
            const d = new Date(today);
            d.setDate(today.getDate() - offset);
            return this.getLocalDateString(d);
        };

        // 1. Seed 3 Athletes
        const seedAthletes = [
            {
                id: 'athlete_1',
                fullName: 'John Doe',
                nickname: 'Johnny',
                dob: '1998-05-15',
                team: 'Sprint Elite',
                photo: null,
                performanceLogs: [
                    { date: dateString(6), cmj: 45.0, rsi: 2.00, reps: 5, weight: 80, e1rm: 92, athleteWeight: 78.5 },
                    { date: dateString(3), cmj: 46.0, rsi: 2.10, reps: 3, weight: 85, e1rm: 94, athleteWeight: 78.2 },
                    // CMJ drop (mean = 43.0, SD = 3.56. 38.0 < 43.0 - 3.56. Triggers 🟥 Fatigue)
                    { date: dateString(0), cmj: 38.0, rsi: 1.45, reps: 1, weight: 95, e1rm: 95, athleteWeight: 78.0 }
                ]
            },
            {
                id: 'athlete_2',
                fullName: 'Jane Smith',
                nickname: 'Janie',
                dob: '2001-09-22',
                team: 'Power Team',
                photo: null,
                performanceLogs: [
                    { date: dateString(6), cmj: 32.0, rsi: 1.40, reps: 8, weight: 100, e1rm: 124, athleteWeight: 65.5 },
                    { date: dateString(3), cmj: 34.0, rsi: 1.55, reps: 5, weight: 110, e1rm: 127, athleteWeight: 65.2 },
                    // CMJ Spike (Mean = 34.67, SD = 2.49. 38.0 > Mean - SD. Triggers 🟩 Ready)
                    { date: dateString(0), cmj: 38.0, rsi: 1.75, reps: 3, weight: 125, e1rm: 138, athleteWeight: 65.0 }
                ]
            },
            {
                id: 'athlete_3',
                fullName: 'Coach Ponrawee',
                nickname: 'Ponrawee',
                dob: '1995-12-10',
                team: 'ATP Coach Staff',
                photo: null,
                performanceLogs: [
                    { date: dateString(6), cmj: 52.0, rsi: 2.40, reps: 3, weight: 120, e1rm: 130, athleteWeight: 82.0 },
                    { date: dateString(3), cmj: 53.5, rsi: 2.52, reps: 2, weight: 125, e1rm: 133, athleteWeight: 81.8 },
                    { date: dateString(0), cmj: 55.0, rsi: 2.65, reps: 1, weight: 130, e1rm: 130, athleteWeight: 81.5 }
                ]
            }
        ];

        // Upsert Athletes
        const existingAthletes = this.getAthletes();
        seedAthletes.forEach(seedAth => {
            const idx = existingAthletes.findIndex(a => a.id === seedAth.id);
            if (idx > -1) {
                existingAthletes[idx] = seedAth;
            } else {
                existingAthletes.push(seedAth);
            }
        });
        localStorage.setItem(STORAGE_KEYS.ATHLETES, JSON.stringify(existingAthletes));

        // 2. Seed 4 Workout Logs
        const seedWorkouts = [
            {
                id: 'wk_1',
                athleteId: 'athlete_1',
                name: 'Lower Body Power',
                date: dateString(3),
                exercises: [
                    {
                        exerciseId: '17',
                        name: 'Barbell Back Squat',
                        tempo: '3010',
                        restInterval: '90s',
                        targetRpe: 'RPE @8',
                        sets: [
                            { targetReps: 5, reps: 5, weight: 80, rpe: 8, completed: true },
                            { targetReps: 5, reps: 5, weight: 80, rpe: 8, completed: true },
                            { targetReps: 5, reps: 5, weight: 80, rpe: 8, completed: true }
                        ]
                    }
                ]
            },
            {
                id: 'wk_2',
                athleteId: 'athlete_1',
                name: 'Upper Body Hypertrophy',
                date: dateString(1),
                exercises: [
                    {
                        exerciseId: '11',
                        name: 'Barbell Bench Press',
                        tempo: '2010',
                        restInterval: '60s',
                        targetRpe: 'RPE @7',
                        sets: [
                            { targetReps: 10, reps: 10, weight: 65, rpe: 7, completed: true },
                            { targetReps: 10, reps: 10, weight: 65, rpe: 7, completed: true },
                            { targetReps: 10, reps: 9, weight: 65, rpe: 8, completed: true }
                        ]
                    }
                ]
            },
            {
                id: 'wk_3',
                athleteId: 'athlete_2',
                name: 'On-Court Basketball Conditioning',
                date: dateString(2),
                exercises: [
                    {
                        exerciseId: '31',
                        name: 'Assault Bike Sprint',
                        tempo: 'MAX INTENT',
                        restInterval: '2min',
                        targetRpe: 'RPE @9',
                        sets: [
                            { targetReps: 10, reps: 10, weight: 0, rpe: 9, completed: true },
                            { targetReps: 10, reps: 10, weight: 0, rpe: 9, completed: true },
                            { targetReps: 10, reps: 10, weight: 0, rpe: 9, completed: true }
                        ]
                    },
                    {
                        exerciseId: '20',
                        name: 'Romanian Deadlift',
                        tempo: '3010',
                        restInterval: '90s',
                        targetRpe: 'RPE @8',
                        sets: [
                            { targetReps: 8, reps: 8, weight: 70, rpe: 8, completed: true },
                            { targetReps: 8, reps: 8, weight: 75, rpe: 8, completed: true },
                            { targetReps: 8, reps: 8, weight: 80, rpe: 9, completed: true }
                        ]
                    }
                ]
            },
            {
                id: 'wk_4',
                athleteId: 'athlete_3',
                name: 'Olympic Lifting Power',
                date: dateString(1),
                exercises: [
                    {
                        exerciseId: '23',
                        name: 'Hang Power Clean',
                        tempo: 'Explosive',
                        restInterval: '3min',
                        targetRpe: 'RPE @8.5',
                        sets: [
                            { targetReps: 3, reps: 3, weight: 90, rpe: 8.5, completed: true },
                            { targetReps: 3, reps: 3, weight: 90, rpe: 8.5, completed: true },
                            { targetReps: 3, reps: 3, weight: 90, rpe: 8.5, completed: true }
                        ]
                    }
                ]
            }
        ];

        // Upsert Workouts
        const existingWorkouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUTS)) || [];
        seedWorkouts.forEach(seedWk => {
            const idx = existingWorkouts.findIndex(w => w.id === seedWk.id);
            if (idx > -1) {
                existingWorkouts[idx] = seedWk;
            } else {
                existingWorkouts.push(seedWk);
            }
        });
        localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(existingWorkouts));

        // 3. Seed Wellness Logs
        const seedWellness = [
            { athleteId: 'athlete_1', date: dateString(0), sleep: 8, soreness: 8, energy: 7, stress: 8 },
            { athleteId: 'athlete_1', date: dateString(1), sleep: 7, soreness: 6, energy: 6, stress: 7 },
            { athleteId: 'athlete_2', date: dateString(0), sleep: 9, soreness: 9, energy: 9, stress: 9 },
            { athleteId: 'athlete_3', date: dateString(0), sleep: 8, soreness: 8, energy: 8, stress: 8 }
        ];

        // Upsert Wellness
        const existingWellness = JSON.parse(localStorage.getItem(STORAGE_KEYS.WELLNESS)) || [];
        seedWellness.forEach(seedWel => {
            const idx = existingWellness.findIndex(w => w.date === seedWel.date && w.athleteId === seedWel.athleteId);
            if (idx > -1) {
                existingWellness[idx] = seedWel;
            } else {
                existingWellness.push(seedWel);
            }
        });
        localStorage.setItem(STORAGE_KEYS.WELLNESS, JSON.stringify(existingWellness));

        // 4. Seed Periodization Phases
        const seedPhases = [
            {
                id: 'phase_1',
                athleteId: 'athlete_1',
                label: 'Off-Season Prep',
                startDate: dateString(30),
                endDate: dateString(10),
                type: 'prep',
                notes: 'Focus on base volume and conditioning'
            },
            {
                id: 'phase_2',
                athleteId: 'athlete_1',
                label: 'Pre-Comp Taper',
                startDate: dateString(9),
                endDate: dateString(2),
                type: 'taper',
                notes: 'Decrease volume, keep intensity high'
            },
            {
                id: 'phase_3',
                athleteId: 'athlete_1',
                label: 'In-Season Competition',
                startDate: dateString(1),
                endDate: dateString(-10),
                type: 'comp',
                notes: 'Maintain peak strength and recover'
            }
        ];

        // Upsert Phases
        const existingPhases = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_PHASES)) || [];
        seedPhases.forEach(seedPh => {
            const idx = existingPhases.findIndex(p => p.id === seedPh.id);
            if (idx > -1) {
                existingPhases[idx] = seedPh;
            } else {
                existingPhases.push(seedPh);
            }
        });
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_PHASES, JSON.stringify(existingPhases));

        // 5. Seed Periodization Matches (Tournaments)
        const seedMatches = [
            {
                id: 'match_1',
                name: 'BISAL Super League',
                venue: 'Bangkok Arena',
                date: dateString(5),
                ageGroup: 'U18',
                notes: 'First tournament of the season',
                athleteIds: ['athlete_1', 'athlete_2']
            },
            {
                id: 'match_2',
                name: '3x3 Road to Champions',
                venue: 'ATP Stadium',
                date: dateString(-1),
                ageGroup: 'Open',
                notes: 'Qualifiers round',
                athleteIds: ['athlete_1', 'athlete_3']
            },
            {
                id: 'match_3',
                name: 'National School Finals',
                venue: 'Chiang Mai Court',
                date: dateString(-7),
                ageGroup: 'U18',
                notes: 'Championship grand finals',
                athleteIds: ['athlete_2', 'athlete_3']
            }
        ];

        // Upsert Matches
        const existingMatches = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_MATCHES)) || [];
        seedMatches.forEach(seedM => {
            const idx = existingMatches.findIndex(m => m.id === seedM.id);
            if (idx > -1) {
                existingMatches[idx] = seedM;
            } else {
                existingMatches.push(seedM);
            }
        });
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_MATCHES, JSON.stringify(existingMatches));
    },

    getAthletes() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.ATHLETES)) || []; },
    getAthleteById(id) { return this.getAthletes().find(a => a.id === id); },
    saveAthlete(athlete) {
        const athletes = this.getAthletes();
        const index = athletes.findIndex(a => a.id === athlete.id);
        if (index > -1) { athletes[index] = athlete; } else { athletes.push(athlete); }
        localStorage.setItem(STORAGE_KEYS.ATHLETES, JSON.stringify(athletes));
        return athlete;
    },
    deleteAthlete(id) {
        let athletes = this.getAthletes().filter(a => a.id !== id);
        localStorage.setItem(STORAGE_KEYS.ATHLETES, JSON.stringify(athletes));
    },
    logPerformance(athleteId, performanceEntry) {
        const athletes = this.getAthletes();
        const athlete = athletes.find(a => a.id === athleteId);
        if (athlete) {
            if (!athlete.performanceLogs) athlete.performanceLogs = [];
            const existingIndex = athlete.performanceLogs.findIndex(log => log.date === performanceEntry.date);
            if (existingIndex > -1) { athlete.performanceLogs[existingIndex] = performanceEntry; } else { athlete.performanceLogs.push(performanceEntry); }
            athlete.performanceLogs.sort((a, b) => new Date(a.date) - new Date(b.date));
            this.saveAthlete(athlete);
            return performanceEntry;
        }
        return null;
    },
    getPerformanceLogs(athleteId) {
        const athlete = this.getAthleteById(athleteId);
        return athlete ? (athlete.performanceLogs || []) : [];
    },
    getExercises() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.EXERCISES)) || []; },
    addExercise(name, category, primaryMuscle) {
        const exercises = this.getExercises();
        const newEx = { id: Date.now().toString(), name, category, primaryMuscle };
        exercises.push(newEx);
        localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(exercises));
        return newEx;
    },
    deleteExercise(id) {
        const defaultIds = DEFAULT_EXERCISES.map(ex => ex.id);
        if (defaultIds.includes(id)) {
            return { success: false, error: 'Cannot delete default system exercises.' };
        }
        let exercises = this.getExercises();
        const initialLen = exercises.length;
        exercises = exercises.filter(ex => ex.id !== id);
        if (exercises.length === initialLen) {
            return { success: false, error: 'Exercise not found.' };
        }
        localStorage.setItem(STORAGE_KEYS.EXERCISES, JSON.stringify(exercises));
        return { success: true };
    },
    getWellnessLogs(athleteId) {
        const allLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.WELLNESS)) || [];
        const activeId = athleteId || (window.App ? window.App.currentAthleteId : 'athlete_1');
        return allLogs.filter(log => log.athleteId === activeId);
    },
    getWellnessForDate(athleteId, dateStr) {
        const logs = this.getWellnessLogs(athleteId);
        return logs.find(log => log.date === dateStr);
    },
    saveWellness(wellnessLog) {
        const allLogs = JSON.parse(localStorage.getItem(STORAGE_KEYS.WELLNESS)) || [];
        const index = allLogs.findIndex(log => log.date === wellnessLog.date && log.athleteId === wellnessLog.athleteId);
        if (index > -1) { allLogs[index] = wellnessLog; } else { allLogs.push(wellnessLog); }
        localStorage.setItem(STORAGE_KEYS.WELLNESS, JSON.stringify(allLogs));
        return wellnessLog;
    },
    calculateReadiness(wellnessLog) {
        if (!wellnessLog) return null;
        const total = wellnessLog.sleep + wellnessLog.soreness + wellnessLog.energy + wellnessLog.stress;
        return Math.round((total / 40) * 100);
    },
    getWorkouts(athleteId) {
        const allWorkouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUTS)) || [];
        const activeId = athleteId || (window.App ? window.App.currentAthleteId : 'athlete_1');
        return allWorkouts.filter(w => w.athleteId === activeId);
    },
    getWorkoutById(id) {
        const allWorkouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUTS)) || [];
        return allWorkouts.find(w => w.id === id);
    },
    saveWorkout(workout) {
        const allWorkouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUTS)) || [];
        const index = allWorkouts.findIndex(w => w.id === workout.id);
        if (index > -1) { allWorkouts[index] = workout; } else { allWorkouts.push(workout); }
        localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(allWorkouts));
        return workout;
    },
    deleteWorkout(id) {
        let allWorkouts = JSON.parse(localStorage.getItem(STORAGE_KEYS.WORKOUTS)) || [];
        allWorkouts = allWorkouts.filter(w => w.id !== id);
        localStorage.setItem(STORAGE_KEYS.WORKOUTS, JSON.stringify(allWorkouts));
    },
    calculateTotalVolume(workout) {
        let total = 0;
        workout.exercises.forEach(ex => {
            ex.sets.forEach(set => {
                if (set.completed && set.weight && set.reps) {
                    total += parseFloat(set.weight) * parseInt(set.reps);
                }
            });
        });
        return total;
    },
    estimateOneRepMax(weight, reps) {
        if (!weight || !reps) return 0;
        if (reps === 1) return weight;
        if (reps > 10) return Math.round(weight * (1 + reps / 30));
        return Math.round(weight / (1.0278 - (0.0278 * reps)));
    },
    getPersonalRecords(athleteId) {
        const workouts = this.getWorkouts(athleteId);
        const prs = {};
        workouts.forEach(workout => {
            workout.exercises.forEach(ex => {
                ex.sets.forEach(set => {
                    if (set.completed && set.weight && set.reps) {
                        const est1RM = this.estimateOneRepMax(set.weight, set.reps);
                        if (!prs[ex.exerciseId] || est1RM > prs[ex.exerciseId].estimated1RM) {
                            prs[ex.exerciseId] = {
                                weight: set.weight,
                                reps: set.reps,
                                date: workout.date,
                                estimated1RM: est1RM,
                                exerciseName: ex.name
                            };
                        }
                    }
                });
            });
        });
        return prs;
    },
    getMatches() { return JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_MATCHES)) || []; },
    saveMatch(matchData) {
        const matches = this.getMatches();
        const index = matches.findIndex(m => m.id === matchData.id);
        if (index > -1) { matches[index] = matchData; } else { matches.push(matchData); }
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_MATCHES, JSON.stringify(matches));
        return matchData;
    },
    deleteMatch(id) {
        let matches = this.getMatches().filter(m => m.id !== id);
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_MATCHES, JSON.stringify(matches));
    },
    getPhases(athleteId) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_PHASES)) || [];
        if (!athleteId) return all;
        return all.filter(p => p.athleteId === athleteId);
    },
    savePhase(phaseData) {
        const all = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_PHASES)) || [];
        const index = all.findIndex(p => p.id === phaseData.id);
        if (index > -1) { all[index] = phaseData; } else { all.push(phaseData); }
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_PHASES, JSON.stringify(all));
        return phaseData;
    },
    deletePhase(id) {
        let all = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODIZATION_PHASES)) || [];
        all = all.filter(p => p.id !== id);
        localStorage.setItem(STORAGE_KEYS.PERIODIZATION_PHASES, JSON.stringify(all));
    },
    getTests() {
        const defaults = [
            { id: 'cmj', name: 'CMJ Jump', category: 'Jump', type: 'special_cmj' },
            { id: 'rsi', name: '10/5 RSI', category: 'Jump', type: 'standard', unit: 'index' },
            { id: 'weight', name: 'Body Weight', category: 'Other', type: 'standard', unit: 'kg' },
            { id: 'e1rm', name: 'e1RM Strength', category: 'Strength', type: 'special_e1rm' },
            { id: 'sprint_3_4_court', name: '3/4 Court Sprint', category: 'Sprint', type: 'standard', unit: 'sec' },
            { id: 'sprint_full_court', name: 'Full Court Sprint', category: 'Sprint', type: 'standard', unit: 'sec' }
        ];
        const customs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_TESTS)) || [];
        return [...defaults, ...customs];
    },
    addCustomTest(name, category, unit) {
        const customs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_TESTS)) || [];
        const id = 'custom_' + Date.now();
        const newTest = { id, name, category, type: 'standard', unit };
        customs.push(newTest);
        localStorage.setItem(STORAGE_KEYS.CUSTOM_TESTS, JSON.stringify(customs));
        return newTest;
    },
    deleteCustomTest(id) {
        let customs = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_TESTS)) || [];
        customs = customs.filter(t => t.id !== id);
        localStorage.setItem(STORAGE_KEYS.CUSTOM_TESTS, JSON.stringify(customs));
    }
};
window.Store = Store;
