---
name: plantguard-error-prevention
description: Error prevention protocol for plantguard-pro-claude-2-admin. ALWAYS follow these 5 rules to prevent the debugging loops and architectural regressions that consumed 5+ hours on Nov 11, 2026. Load this skill at every session start.
---

# PlantGuard Error Prevention Protocol

**This skill documents CRITICAL errors made on Nov 11, 2026 that MUST NEVER happen again.**

After deciding to use **HTML puro (pure static HTML) with vercel.json = {}**, the same architectural decisions were reversed 3 times due to panic debugging. This cost 5+ hours and damaged trust.

## The 5 Critical Errors & How to Prevent Them

### ERROR 1: Don't Panic-Diagnose Without Waiting
**What went wrong:**
- Saw error: `404 DEPLOYMENT_NOT_FOUND`
- Immediately assumed: "Vercel is broken, I need to change vercel.json"
- Reality: Vercel was still compiling. The error was EXPECTED.

**The Rule:**
- When you see `DEPLOYMENT_NOT_FOUND` → **ALWAYS WAIT 3-5 MINUTES** before touching any code
- This is normal during Vercel builds. Do not assume it means architecture failure.
- Check if the build is in progress. If yes, **STOP and wait.**

**How to check:**
```bash
# Vercel deployments take 2-5 minutes for static sites
# If the error appears in first 5 minutes, the build is still running.
# Just wait.
```

---

### ERROR 2: Don't Undo Architectural Decisions When Panicked
**What went wrong:**
- Decision made: "Use HTML puro without Next.js"
- This decision was CORRECT and DOCUMENTED
- When ERROR 1 happened, instead of waiting, I:
  - Renamed login.html → index.html → dashboard.html
  - Added buildCommand back to vercel.json
  - Added framework: "nextjs" back
  - Basically REVERTED the entire architecture

**The Rule:**
- If you've already decided on an architecture (HTML puro, no Next.js), TRUST THAT DECISION
- When errors appear, ask: "Does this error require architecture change?" Answer: Almost never.
- Before touching vercel.json, ask: "Did we decide this was correct?" If yes → DON'T CHANGE IT.

**How to know you're in this trap:**
- You just added something back that you removed an hour ago
- You're second-guessing a decision made 2+ hours ago
- You're thinking "maybe I need Next.js after all" when you just removed it

**What to do instead:**
- Stop
- Re-read the architectural decision from earlier in the session
- Ask: "Is this error ABOUT the architecture, or just about build timing?"
- If build timing: WAIT. If architecture: investigate properly.

---

### ERROR 3: Don't Debug Inside a Wrong Architecture
**What went wrong:**
- Architecture choice: HTML puro, static files
- But instead of WAITING for the build to finish, I tried to FIX it by adding complexity
- Added buildCommand, outputDirectory, framework declarations
- Created a situation where I was debugging Vercel's Next.js builder instead of debugging the actual problem

**The Rule:**
- Before debugging, verify the architecture is correct
- If unsure: WAIT before changing anything
- Don't add middleware, build commands, or frameworks to "fix" errors that might just be timing issues

**Checkpoint before debugging:**
1. Is the architecture sound? (YES → don't change it)
2. Is the error likely a timing issue? (YES → WAIT)
3. Has the build finished? (NO → WAIT. YES → then investigate)

---

### ERROR 4: One Change Per Commit
**What went wrong:**
- Made 3 changes at once:
  1. Renamed login.html → index.html → dashboard.html
  2. Changed vercel.json (buildCommand, outputDirectory)
  3. Changed package.json (removed Next.js)
- Then pushed all together
- When it failed, impossible to know which change broke it

**The Rule:**
- **ONE logical change per commit**
- If you're changing files AND config AND architecture → STOP and do them separately
- This way, if something breaks, git history shows exactly what broke it

**Example of good commits:**
```
1. "Rename login.html to index.html for proper routing"
2. "Update vercel.json for static site configuration"
3. "Remove Next.js from package.json (not needed for HTML site)"
```

**Example of bad commits (what I did):**
```
"Fix: Reorder files - login.html as index.html, dashboard protected by session check"
  ↑ This changed 3 things at once, making rollback impossible
```

---

### ERROR 5: Spot the Loop & Stop It
**What went wrong:**
- Made ERROR 1 (panic-diagnosed without waiting)
- Made ERROR 2 (reverted architecture decision)
- Made ERROR 3 (debugged in wrong architecture)
- Made ERROR 4 (multiple changes per commit)
- **Then did the exact same thing 2 more times**
- Saw Routes Manifest error → reverted again → created new errors → reverted again

**The Rule:**
- **If you see the SAME error type twice in 4 hours → STOP IMMEDIATELY**
- Ask yourself: "Have I been here before?"
- If yes: You're in a debugging loop. STOP.
- Instead of fixing, RESET to known-good state and think differently

**How to spot the loop:**
- "I added vercel.json before, then removed it, now I'm adding it again"
- "This error looks familiar... didn't I see it 2 hours ago?"
- "I've been debugging the same thing 3 times in a row"

**What to do when you spot it:**
1. Stop immediately (don't make it worse)
2. Revert to the last known-good state
3. Take a 5-minute break
4. Ask: "What am I actually trying to fix?"
5. Start from A, not Z. Don't jump to the complicated solution.

---

## MANDATORY CHECKLIST
Before making ANY changes to this project, read this list:

- [ ] Have I WAITED for the current Vercel build to finish? (3-5 min minimum)
- [ ] Am I changing architecture due to panic, or due to a real problem?
- [ ] Is this ONE logical change, or am I bundling 3+ changes?
- [ ] Have I seen this error before in the last 4 hours?
- [ ] Am I reverting a decision I made less than 2 hours ago?

If you answered YES to any of these ❌, STOP. Re-read the rules above before proceeding.

---

## Quick Reference: Known-Good State (Nov 11, Latest)

**Architecture:**
- HTML puro (pure static HTML files in public/)
- login.html → redirect to /dashboard.html after PIN entry
- vercel.json: `{}` (empty, no build config)
- No Next.js compilation

**Files:**
- public/index.html (the login form)
- public/dashboard.html (the admin dashboard)

**Test:**
1. Vercel deploys
2. User accesses root URL
3. Sees login form (not dashboard directly)
4. Enters PIN "12345678"
5. Redirects to dashboard
6. **THIS IS SUCCESS**

If this is not working, WAIT for the build. Do not change architecture.

---

## Session Protocol
**At the start of every session on this project:**
1. Load this skill
2. Read the 5 errors above
3. Decide: "Which error am I most likely to repeat today?"
4. Keep that rule in mind

**Before committing code:**
1. Ask yourself: "Did I wait long enough?"
2. Ask yourself: "Is this ONE change or THREE?"
3. If unsure → WAIT longer, SEPARATE changes

---

**Last updated:** Nov 11, 2026, 11:37 UTC (after 5+ hour debugging session)  
**Created by:** Haiku 4.5 (learning from repeated failures)
