# GitHub Templates & Workflows Guide

This document explains all the GitHub templates and workflows set up for the Houston Housing project.

## 📋 What's Included

### Issue Templates (`.github/ISSUE_TEMPLATE/`)

Six specialized templates for different issue types:

1. **Bug Report** - For reporting bugs
2. **Feature Request** - For suggesting new features
3. **Documentation** - For documentation improvements
4. **Performance Issue** - For performance problems
5. **Security Issue** - For security vulnerabilities
6. **CI/CD Failure** - For pipeline failures

Each template includes:

- Clear sections for required information
- Helpful examples
- Verification checklists
- Automatic labeling

### Pull Request Template (`.github/pull_request_template.md`)

Comprehensive template for all PRs with sections for:

- Description of changes
- Type of change (bug, feature, etc.)
- Testing performed
- Comprehensive checklist covering:
  - Code quality
  - Testing
  - Documentation
  - Database changes (backend)
  - Security
  - Performance
  - Breaking changes

### Security Policy (`SECURITY.md`)

Guidelines for:

- Reporting security vulnerabilities responsibly
- Security best practices
- Incident response procedures
- Security checklist for PRs

### Configuration (`config.yml`)

Disables blank issues and provides quick links to:

- GitHub Discussions
- Security reporting email
- Documentation
- Contact information

## 🎯 How to Use

### Creating an Issue

1. Go to **Issues** tab
2. Click **New Issue**
3. Choose the appropriate template
4. Fill in all sections
5. Submit

### Creating a Pull Request

1. Push your branch
2. Create PR on GitHub
3. Template auto-fills
4. Complete all sections
5. Submit for review

## 📝 Issue Types & When to Use

### 🐛 Bug Report

**When**: Something is broken or not working as expected

**Example titles**:

- "[BUG] Login fails on mobile devices"
- "[BUG] Property filter returns no results"
- "[BUG] Payment confirmation email not sent"

**Key sections**:

- Steps to reproduce
- Expected vs actual behavior
- Environment details
- Screenshots/logs

---

### ✨ Feature Request

**When**: You want to suggest a new feature or improvement

**Example titles**:

- "[FEATURE] Add dark mode toggle"
- "[FEATURE] Implement email notifications"
- "[FEATURE] Add property comparison tool"

**Key sections**:

- Problem statement
- Proposed solution
- Acceptance criteria
- Impact assessment

---

### 📚 Documentation

**When**: Documentation is missing or needs improvement

**Example titles**:

- "[DOCS] Add Windows setup guide"
- "[DOCS] Document API authentication"
- "[DOCS] Add contract deployment guide"

**Key sections**:

- Location where docs should go
- Content outline
- Target audience

---

### ⚡ Performance Issue

**When**: You've identified a performance problem

**Example titles**:

- "[PERF] API response time is 5s, should be <1s"
- "[PERF] Frontend bundle size increased 50%"
- "[PERF] Database queries are slow"

**Key sections**:

- Current vs expected performance
- Root cause analysis
- Proposed solution
- Success metrics

---

### 🔒 Security Issue

**When**: You've found a security vulnerability

**⚠️ IMPORTANT**: Use private reporting, not public issues!

**Options**:

1. Email: security@huston-housing.dev
2. GitHub private vulnerability reporting
3. See SECURITY.md for details

**Key sections**:

- Vulnerability type
- Affected component
- Impact assessment
- Reproduction steps

---

### 🚨 CI/CD Failure

**When**: A GitHub Actions pipeline is failing

**Example titles**:

- "[CI/CD] Backend build failing on main"
- "[CI/CD] Frontend tests timing out"
- "[CI/CD] Contract deployment failed"

**Key sections**:

- Failed job details
- Error messages and logs
- Root cause
- Solution

---

## ✅ Best Practices

### Writing Good Issues

**Be Specific**

```
❌ Bad: "Something is broken"
✅ Good: "Login fails with 'Invalid credentials' error when using email with + symbol"
```

**Provide Context**

```
❌ Bad: "It doesn't work"
✅ Good: "On Windows 10, when I click the login button, nothing happens. No error message appears."
```

**Include Reproduction Steps**

```
❌ Bad: "The app crashes sometimes"
✅ Good: "Steps: 1. Open app, 2. Go to properties, 3. Click filter, 4. Select 'price', 5. App crashes"
```

**Add Relevant Details**

- Environment (OS, browser, versions)
- Screenshots or logs
- Related issues or PRs
- Expected vs actual behavior

### Writing Good PRs

**Clear Title**

```
✅ Good: "feat: add dark mode toggle to settings"
✅ Good: "fix: prevent SQL injection in search"
❌ Bad: "update stuff"
```

**Complete Checklist**

- All items should be checked before submitting
- If something doesn't apply, explain why
- Don't skip sections

**Detailed Description**

- Explain WHAT changed
- Explain WHY it changed
- Explain HOW it was tested

**Link Related Issues**

```
Closes #123
Related to #456
```

## 🏷️ Labels

Issues are automatically labeled based on template:

| Label           | Template          | Color  |
| --------------- | ----------------- | ------ |
| `bug`           | Bug Report        | Red    |
| `enhancement`   | Feature Request   | Green  |
| `documentation` | Documentation     | Blue   |
| `performance`   | Performance Issue | Orange |
| `security`      | Security Issue    | Purple |
| `ci-cd`         | CI/CD Failure     | Yellow |

Additional labels added during triage:

- `good first issue` - Good for new contributors
- `help wanted` - Need community help
- `blocked` - Blocked by another issue
- `priority-high` - High priority
- `priority-low` - Low priority

## 🔄 Issue Lifecycle

```
Created
   ↓
Triaged (labeled, assigned)
   ↓
Assigned (developer assigned)
   ↓
In Progress (work started)
   ↓
In Review (PR created)
   ↓
Closed (resolved)
```

## 📊 Metrics

Track these metrics to improve:

- **Issue Response Time** - How quickly issues are triaged
- **Issue Resolution Time** - How long issues stay open
- **PR Review Time** - How long PRs are in review
- **PR Merge Rate** - Percentage of PRs merged
- **Bug Escape Rate** - Bugs found in production

## 🚀 Tips for Faster Resolution

1. **Use the right template** - Helps team understand issue type
2. **Be detailed** - More info = faster resolution
3. **Provide reproduction steps** - Saves debugging time
4. **Include environment details** - Helps identify platform-specific issues
5. **Link related issues** - Shows context and dependencies
6. **Follow up** - Respond to questions from the team
7. **Check existing issues** - Avoid duplicates
8. **Use clear titles** - Makes issues searchable

## 🔐 Security Reporting

**Never create public issues for security vulnerabilities!**

### Reporting Process

1. **Email**: security@huston-housing.dev
2. **Include**:
   - Description of vulnerability
   - Affected component
   - Reproduction steps
   - Potential impact
   - Suggested fix (if available)

3. **Timeline**:
   - Initial response: 24 hours
   - Assessment: 48 hours
   - Fix development: Depends on severity
   - Public disclosure: After fix is released

See `SECURITY.md` for full details.

## 📚 Related Documentation

- **CONTRIBUTING.md** (Frontend) - Frontend development guide
- **backend/CONTRIBUTING.md** - Backend development guide
- **contract/CONTRIBUTING.md** - Contract development guide
- **SECURITY.md** - Security policy and best practices
- **README.md** - Project overview

## ❓ FAQ

**Q: What if my issue doesn't fit any template?**
A: Use the closest template and modify as needed. Or create a blank issue if necessary.

**Q: Can I create a security issue publicly?**
A: No! Always use private reporting. See SECURITY.md for details.

**Q: How do I link issues in PRs?**
A: Use `Closes #123` or `Related to #456` in PR description.

**Q: What if I'm not sure which template to use?**
A: Check the template descriptions above or ask in Discussions.

**Q: Can I edit an issue after creating it?**
A: Yes! Click the three dots menu and select "Edit".

## 🤝 Contributing

When contributing:

1. Check existing issues first
2. Use the appropriate template
3. Fill in all sections
4. Follow the checklist
5. Be specific and detailed
6. Link related issues
7. Respond to feedback

## 📞 Contact

- **Questions**: GitHub Discussions
- **Security**: security@huston-housing.dev
- **General**: GitHub Issues

---

**Remember**: Clear, descriptive issues and PRs get resolved faster! 🚀
