import sys
import re

file_path = "js/liveTracker.js"
with open(file_path, "r") as f:
    content = f.read()

# === BUG 2, 3, 4: Fix pushLiveTrackerToMatchLog ===
push_pattern = r"(logs\[index\]\.games\.push\(newGameRound\);.*?logs\[index\]\.oppStats\[k\] = \(logs\[index\]\.oppStats\[k\] \|\| 0\) \+ \(oppStatsCopy\[k\] \|\| 0\);\n\s*\}\);)"
push_replacement = """if (logs[index].games.length > 0) {
                    logs[index].games[0] = newGameRound;
                } else {
                    logs[index].games.push(newGameRound);
                }
                logs[index].atpScore = newGameRound.scoreAtp;
                logs[index].oppScore = newGameRound.scoreOpp;
                logs[index].our_pts_from_to = newGameRound.our_pts_from_to || 0;
                logs[index].opp_pts_from_to = newGameRound.opp_pts_from_to || 0;
                logs[index].oppStats = oppStatsCopy;"""

content = re.sub(push_pattern, push_replacement, content, flags=re.DOTALL)

# Workloads fix
workloads_pattern = r"(playerStats\.forEach\(ps => \{\n\s*if \(ps\.athleteId\) \{\n\s*const gameLoad = \(ps\.min \|\| 20\) \* 8\.5;\n\s*const workloads = JSON\.parse\(localStorage\.getItem\('personal_ams_workloads'\) \|\| '\[\]'\);\n\s*workloads\.push\(\{)"
workloads_replacement = """
        const targetMatchId = matchId !== 'new' ? matchId : (logs.length > 0 ? logs[logs.length-1].id : 'unknown_match');
        let workloads = JSON.parse(localStorage.getItem('personal_ams_workloads') || '[]');
        workloads = workloads.filter(w => w.matchId !== targetMatchId); // Clear old workloads for this match

        playerStats.forEach(ps => {
            if (ps.athleteId) {
                const gameLoad = (ps.min || 20) * 8.5;
                workloads.push({
                    matchId: targetMatchId,"""
                    
content = re.sub(workloads_pattern, workloads_replacement, content, flags=re.DOTALL)

# Move workloads saving out of the loop
wl_save_pattern = r"\}\);\n\s*localStorage\.setItem\('personal_ams_workloads', JSON\.stringify\(workloads\)\);\n\s*\}\);"
wl_save_replacement = """});
            }
        });
        localStorage.setItem('personal_ams_workloads', JSON.stringify(workloads));"""
content = re.sub(wl_save_pattern, wl_save_replacement, content, flags=re.DOTALL)


# === BUG 1: Fix recalculateLiveTrackerFromPbp ===
# I will use a direct text replace for the inner loop of recalculateLiveTrackerFromPbp

recalc_opponent_block = """            if (evt.isOpponent) {
                const stats = this.liveTracker.oppStats;
                if (action === '2') {
                    deltaPts = 2; stats.pts += 2; stats.fgm += 1; stats.fga += 1; stats.fg2m = (stats.fg2m||0)+1; stats.fg2a = (stats.fg2a||0)+1;
                    desc = `+2 PTS Made by ${oppName}`;
                } else if (action === 'w' || action === 'c') {
                    stats.fga += 1; stats.fg2a = (stats.fg2a||0)+1; desc = `2PT Missed by ${oppName}`;
                } else if (action === '3') {
                    deltaPts = 3; stats.pts += 3; stats.fgm += 1; stats.fga += 1; stats.fg3m = (stats.fg3m||0)+1; stats.fg3a = (stats.fg3a||0)+1;
                    desc = `+3 PTS Made by ${oppName}`;
                } else if (action === 'e' || action === 'v') {
                    stats.fga += 1; stats.fg3a = (stats.fg3a||0)+1; desc = `3PT Missed by ${oppName}`;
                } else if (action === '1' || action === 'f') {
                    deltaPts = 1; stats.pts += 1; stats.ftm = (stats.ftm||0)+1; stats.fta = (stats.fta||0)+1; desc = `+1 FT Made by ${oppName}`;
                } else if (action === 'g') {
                    stats.fta = (stats.fta||0)+1; desc = `FT Missed by ${oppName}`;
                } else if (action === 'd' || action === 'r') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Def Rebound by ${oppName}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'o') {
                    stats.oreb = (stats.oreb||0)+1; stats.reb = (stats.oreb||0) + (stats.dreb||0); desc = `Off Rebound by ${oppName}`;
                } else if (action === 'a') {
                    stats.ast += 1; desc = `Assist by ${oppName}`;
                } else if (action === 's') {
                    stats.stl += 1; desc = `Steal by ${oppName}`;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = false;
                        this.liveTracker.oppTransitionActive = true;
                    } else if (!this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = true;
                    }
                } else if (action === 'b') {
                    stats.blk += 1; desc = `Block by ${oppName}`;
                } else if (action === 'k' || action === 't') {
                    stats.to += 1; desc = `Turnover by ${oppName}`;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = false;
                        this.liveTracker.ourTransitionActive = true;
                    } else if (!this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = true;
                    }
                } else if (action === 'x') {
                    stats.pf += 1; desc = `Personal Foul by ${oppName}`;
                    this.liveTracker.ourTransitionActive = false; this.liveTracker.oppTransitionActive = false;
                }

                if (deltaPts > 0) {
                    this.liveTracker.scoreOpp = (this.liveTracker.scoreOpp || 0) + deltaPts;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.opp_pts_from_to = (this.liveTracker.opp_pts_from_to || 0) + deltaPts;
                        this.liveTracker.oppTransitionActive = false;
                    }
                    (this.liveTracker.onCourtIds || []).forEach(id => {
                        if (this.liveTracker.playerStats[id]) {
                            this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) - deltaPts;
                        }
                    });
                }"""

recalc_our_block = """            } else if (evt.athleteId) {
                if (!this.liveTracker.playerStats[evt.athleteId]) {
                    this.liveTracker.playerStats[evt.athleteId] = { min: 0, pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0, pm: 0, eff: 0 };
                }
                const stats = this.liveTracker.playerStats[evt.athleteId];
                const ath = athletes.find(a => a.id === evt.athleteId);
                const name = ath ? (ath.nickname || ath.fullName) : evt.athleteId;

                if (action === '2') {
                    deltaPts = 2; stats.pts += 2; stats.fgm += 1; stats.fga += 1; stats.fg2m += 1; stats.fg2a += 1;
                    desc = `+2 PTS (2PT Made) by ${name}`;
                } else if (action === 'w' || action === 'c') {
                    stats.fga += 1; stats.fg2a += 1; desc = `2PT Missed by ${name}`;
                } else if (action === '3') {
                    deltaPts = 3; stats.pts += 3; stats.fgm += 1; stats.fga += 1; stats.fg3m += 1; stats.fg3a += 1;
                    desc = `+3 PTS (3PT Made) by ${name}`;
                } else if (action === 'e' || action === 'v') {
                    stats.fga += 1; stats.fg3a += 1; desc = `3PT Missed by ${name}`;
                } else if (action === '1' || action === 'f') {
                    deltaPts = 1; stats.pts += 1; stats.ftm += 1; stats.fta += 1; desc = `+1 FT Made by ${name}`;
                } else if (action === 'g') {
                    stats.fta += 1; desc = `FT Missed by ${name}`;
                } else if (action === 'd') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Defensive Rebound by ${name}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'o') {
                    stats.oreb = (stats.oreb||0)+1; stats.reb = (stats.oreb||0) + (stats.dreb||0); desc = `Offensive Rebound by ${name}`;
                } else if (action === 'r') {
                    stats.dreb = (stats.dreb||0)+1; stats.reb = (stats.oreb||0) + stats.dreb; desc = `Rebound by ${name}`;
                    this.liveTracker.oppTransitionActive = false; this.liveTracker.ourTransitionActive = false;
                } else if (action === 'a') {
                    stats.ast += 1; desc = `Assist by ${name}`;
                } else if (action === 's') {
                    stats.stl += 1; desc = `Steal by ${name}`;
                    if (this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = false;
                        this.liveTracker.ourTransitionActive = true;
                    } else if (!this.liveTracker.ourTransitionActive) {
                        if (!this.liveTracker.oppStats) this.liveTracker.oppStats = { pts: 0, reb: 0, oreb: 0, dreb: 0, ast: 0, stl: 0, blk: 0, to: 0, pf: 0, fgm: 0, fga: 0, fg2m: 0, fg2a: 0, fg3m: 0, fg3a: 0, ftm: 0, fta: 0 };
                        this.liveTracker.oppStats.to = (this.liveTracker.oppStats.to || 0) + 1;
                        this.liveTracker.ourTransitionActive = true;
                    }
                } else if (action === 'b') {
                    stats.blk += 1; desc = `Block by ${name}`;
                } else if (action === 'k' || action === 't') {
                    stats.to += 1; desc = `Turnover by ${name}`;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.ourTransitionActive = false;
                        this.liveTracker.oppTransitionActive = true;
                    } else if (!this.liveTracker.oppTransitionActive) {
                        this.liveTracker.oppTransitionActive = true;
                    }
                } else if (action === 'x') {
                    stats.pf += 1; desc = `Personal Foul by ${name}`;
                    this.liveTracker.ourTransitionActive = false; this.liveTracker.oppTransitionActive = false;
                }

                let missedFg = stats.fga > stats.fgm ? (stats.fga - stats.fgm) : 0;
                let missedFt = stats.fta > stats.ftm ? (stats.fta - stats.ftm) : 0;
                stats.eff = (stats.pts + stats.reb + stats.ast + stats.stl + stats.blk) - (missedFg + missedFt + stats.to);

                if (deltaPts > 0) {
                    this.liveTracker.scoreTeam = (this.liveTracker.scoreTeam || 0) + deltaPts;
                    if (this.liveTracker.ourTransitionActive) {
                        this.liveTracker.our_pts_from_to = (this.liveTracker.our_pts_from_to || 0) + deltaPts;
                        this.liveTracker.ourTransitionActive = false;
                    }
                    (this.liveTracker.onCourtIds || []).forEach(id => {
                        if (this.liveTracker.playerStats[id]) {
                            this.liveTracker.playerStats[id].pm = (this.liveTracker.playerStats[id].pm || 0) + deltaPts;
                        }
                    });
                }"""


def replace_between(text, start_str, end_str, new_content):
    start_idx = text.find(start_str)
    if start_idx == -1: return text
    end_idx = text.find(end_str, start_idx)
    if end_idx == -1: return text
    return text[:start_idx] + new_content + text[end_idx:]


# Replace opponent block
start_opp = "            if (evt.isOpponent) {"
end_opp = "            } else if (evt.athleteId) {"
content = replace_between(content, start_opp, end_opp, recalc_opponent_block + "\n")

# Replace our block
start_our = "            } else if (evt.athleteId) {"
end_our = "            }\n\n            evt.deltaPts = deltaPts;"
content = replace_between(content, start_our, end_our, recalc_our_block + "\n")

with open(file_path, "w") as f:
    f.write(content)

print("Fixes applied successfully to js/liveTracker.js!")
