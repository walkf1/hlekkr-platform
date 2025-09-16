# 🔧 Hlekkr Implementation Plan

## 📍 Environment Strategy
- **Local Development:** Test all changes locally first
- **GitHub Push:** Only after local verification
- **Deployment:** Test CDK deployment in clean environment

## 🎯 Task Implementation Details

### **1. GitHub Repository Cleanup**

#### **1.1 Revert Lambda Runtime Changes**
- **Location:** Local → GitHub
- **Files to modify:**
  - `infrastructure/lib/hlekkr-api-stack.ts`
  - `infrastructure/lib/hlekkr-mvp-stack.ts` 
  - `infrastructure/lib/hlekkr-org-stack.ts`
- **Specific changes:** Replace `PYTHON_3_12` with `PYTHON_3_9`
- **Verification:** `grep -r "PYTHON_3_12" infrastructure/lib/` returns empty

#### **1.2 Test CDK Deployment**
- **Location:** Local environment
- **Commands to run:**
  ```bash
  cd infrastructure
  npm install
  npx cdk synth
  npx cdk deploy --all --require-approval never
  ```
- **Success criteria:** All stacks deploy without errors

#### **1.3 Fix Broken Imports**
- **Location:** Local → GitHub
- **Files to check:**
  - `frontend/src/App.tsx`
  - `frontend/src/index.tsx`
  - All component imports in `frontend/src/components/`
- **Verification:** `npm start` loads without console errors

#### **1.4 Update README**
- **Location:** Local → GitHub
- **File:** `README.md`
- **Required sections:**
  - Prerequisites (Node.js, AWS CLI, CDK)
  - Environment setup (.env.local template)
  - Deployment steps (exact commands)
  - Demo access instructions

### **2. Remove Competition Features**

#### **2.1 Delete Judge Components**
- **Location:** Local → GitHub
- **Files to delete:**
  - `frontend/src/components/LoginForm.tsx`
  - `frontend/src/components/JudgeInterface.tsx`
  - `frontend/src/components/ProtectedRoute.tsx`
- **Files to modify:**
  - `frontend/src/index.tsx` (remove judge routes)
- **Verification:** No references to deleted components remain

#### **2.2 Clean Documentation**
- **Location:** Local → GitHub
- **Files to delete:**
  - `JUDGE_ACCESS_GUIDE.md`
- **Files to modify:**
  - `DEMO_GUIDE.md` (remove judge references)
- **Search and replace:** Remove all "judge", "competition", "Kiro" references

### **3. Authentication Simplification**

#### **3.1 Simplify Cognito Setup**
- **Location:** Local → GitHub
- **File:** `infrastructure/lib/auth-stack.ts`
- **Changes:** Keep basic user pool, remove complex policies
- **Account Strategy:** Rename judge1/judge2 → testuser1/testuser2, delete judge3-5
- **Expiry:** Existing accounts valid until Oct 21, 2025

#### **3.2 Remove HITL Workflows**
- **Location:** Local → GitHub
- **Files to modify:**
  - Remove HITL-related components
  - Simplify to: Upload → Analysis → Results

### **4. Demo Stabilization**

#### **4.1 Fix Frontend Loading**
- **Location:** Local testing
- **Files to check:**
  - `frontend/src/index.tsx`
  - `frontend/src/App.tsx`
- **Test:** `npm start` → http://localhost:3000 loads properly
- **Fix:** Ensure React mounting works, no white screen

#### **4.2 Verify Trust Scores**
- **Location:** Local testing
- **Components to test:**
  - Trust score display
  - Simulated data flow
  - Dashboard updates

### **5. Documentation Updates**

#### **5.1 Update DEMO_GUIDE.md**
- **Location:** Local → GitHub
- **New structure:**
  - Quick start (3 steps max)
  - Core features demo
  - Expected results
  - Troubleshooting

#### **5.2 Create .env.example**
- **Location:** Local → GitHub
- **File:** `frontend/.env.example`
- **Contents:** All required environment variables with placeholder values

## 🔍 Verification Checklist

### **Local Testing**
- [ ] `cd infrastructure && npx cdk synth` succeeds
- [ ] `cd frontend && npm start` loads without errors
- [ ] Demo shows trust scores and core functionality
- [ ] No console errors in browser

### **Clean Deployment Test**
- [ ] Fresh clone: `git clone https://github.com/walkf1/hlekkr-platform.git`
- [ ] Follow README instructions exactly
- [ ] Deployment succeeds without manual intervention
- [ ] Demo accessible and functional

### **Code Quality**
- [ ] No broken imports or missing dependencies
- [ ] No references to deleted judge components
- [ ] All environment variables documented
- [ ] Copyright headers remain on key files

## ✅ Requirements Clarified

### **Authentication Strategy**
**Target:** 2 test accounts for production testing
**Current:** 5 judge accounts expire Oct 21, 2025
**Best Practice Options:**
1. **Keep existing judge accounts** until expiry, add 2 new simple accounts
2. **Replace judge accounts** with 2 production test accounts immediately
3. **Hybrid approach** - rename judge1/judge2 to testuser1/testuser2, delete judge3-5

**Recommended:** Option 3 (rename 2, delete 3) - maintains functionality while simplifying

### **Demo Requirements - CONFIRMED**
- ✅ File upload on main page
- ✅ Trust score calculation and display
- ✅ Trust score echoed across all 4 platform tabs
- ✅ Demonstrates production-level tool benefits
- ✅ Simulated data acceptable (not live AI required)

### **Documentation Approach - CONFIRMED**
- ✅ Simple and straightforward instructions
- ✅ Assume: GitHub knowledge + AWS deployment experience
- ✅ Focus on tool-specific setup, not AWS basics
- ✅ "If in doubt, ask" approach

### **Final Requirements - CONFIRMED:**

4. **Component Removal Strategy:** ✅ **Complete deletion**
   - Delete: LoginForm.tsx, JudgeInterface.tsx, ProtectedRoute.tsx
   - Remove: All judge routing logic
   - Result: Cleaner codebase, no legacy code

5. **Environment Variables:** ✅ **Required variables only**
   - .env.example: Essential variables for basic deployment
   - Skip: Optional AWS services documentation
   - Focus: Core functionality setup

6. **Testing Scope:** ✅ **eu-central-1 focus**
   - Documentation: Optimized for eu-central-1 region
   - Deployment: Match current infrastructure location
   - Simplicity: Single region reduces complexity

## 📊 Implementation Order
1. **Local fixes first** (frontend loading, imports)
2. **Infrastructure cleanup** (Lambda runtime, CDK)
3. **Component removal** (judge features)
4. **Documentation updates** (README, guides)
5. **Final testing** (clean deployment)
6. **GitHub push** (all changes together)

**Estimated Time:** 3-4 hours

## ✅ **READY FOR IMPLEMENTATION**
All requirements confirmed. Plan ready for execution tomorrow.