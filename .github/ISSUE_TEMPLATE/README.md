# GitHub Issue Templates

This directory contains templates to help contributors create clear, descriptive, and actionable issues.

## Available Templates

### 🐛 Bug Report (`bug_report.md`)

**Use when**: You've found a bug or unexpected behavior

**Includes**:

- Description of the bug
- Steps to reproduce
- Expected vs actual behavior
- Screenshots/logs
- Environment details
- Related issues

**Example**: "Login button doesn't work on mobile devices"

---

### ✨ Feature Request (`feature_request.md`)

**Use when**: You want to suggest a new feature or enhancement

**Includes**:

- Feature description
- Problem statement
- Proposed solution
- Acceptance criteria
- Alternative solutions
- Impact assessment

**Example**: "Add dark mode toggle to settings"

---

### 📚 Documentation (`documentation.md`)

**Use when**: Documentation is missing or needs improvement

**Includes**:

- Description of documentation needed
- Location where it should go
- Content outline
- Target audience
- Related issues

**Example**: "Add setup guide for Windows developers"

---

### ⚡ Performance Issue (`performance.md`)

**Use when**: You've identified a performance problem or optimization opportunity

**Includes**:

- Description of the issue
- Current vs expected performance
- Root cause analysis
- Proposed solution
- Metrics for measurement

**Example**: "API response time is 5s, should be <1s"

---

### 🔒 Security Issue (`security.md`)

**Use when**: You've found a security vulnerability

**⚠️ IMPORTANT**: Do NOT create public issues for security vulnerabilities!

- Email security@huston-housing.dev instead
- Or use GitHub's private vulnerability reporting
- See SECURITY.md for details

**Includes**:

- Vulnerability description
- Type of vulnerability
- Affected component
- Impact assessment
- Reproduction steps
- Proposed fix

---

### 🚨 CI/CD Pipeline Failure (`ci_cd_failure.md`)

**Use when**: A GitHub Actions pipeline is failing

**Includes**:

- Description of the failure
- Failed job details
- Error messages and logs
- Root cause analysis
- Solution
- Environment details

**Example**: "Backend build failing on main branch"

---

## How to Use

### Creating an Issue

1. Go to the repository's Issues tab
2. Click "New Issue"
3. Choose the appropriate template
4. Fill in all required sections
5. Submit the issue

### Template Structure

Each template includes:

- **Title Format**: Suggested title with category prefix
- **Labels**: Suggested labels for categorization
- **Sections**: Organized sections for information
- **Checklist**: Verification checklist before submitting

## Best Practices

### Be Specific

❌ Bad: "Something is broken"
✅ Good: "Login fails with 'Invalid credentials' error when using email with + symbol"

### Provide Context

❌ Bad: "It doesn't work"
✅ Good: "On Windows 10, when I click the login button, nothing happens. No error message appears."

### Include Reproduction Steps

❌ Bad: "The app crashes sometimes"
✅ Good: "Steps to reproduce: 1. Open app, 2. Go to properties, 3. Click filter, 4. Select 'price', 5. App crashes"

### Add Relevant Details

- Environment (OS, browser, versions)
- Screenshots or logs
- Related issues or PRs
- Expected vs actual behavior

### Use Checklists

- Verify the issue hasn't been reported
- Provide all requested information
- Follow the template structure

## Issue Labels

Issues are automatically labeled based on the template used:

| Label           | Meaning                    |
| --------------- | -------------------------- |
| `bug`           | Something is broken        |
| `enhancement`   | New feature or improvement |
| `documentation` | Documentation needed       |
| `performance`   | Performance issue          |
| `security`      | Security vulnerability     |
| `ci-cd`         | Pipeline failure           |

## Issue Lifecycle

1. **Created** - Issue is created with template
2. **Triaged** - Team reviews and labels
3. **Assigned** - Developer is assigned
4. **In Progress** - Work has started
5. **In Review** - PR is under review
6. **Closed** - Issue is resolved

## Tips for Getting Issues Resolved Faster

1. **Use the right template** - Helps team understand the issue type
2. **Be detailed** - More info = faster resolution
3. **Provide reproduction steps** - Saves debugging time
4. **Include environment details** - Helps identify platform-specific issues
5. **Link related issues** - Shows context and dependencies
6. **Follow up** - Respond to questions from the team

## Questions?

- Check existing issues first
- Read the CONTRIBUTING.md guides
- Ask in GitHub Discussions
- Email the team

---

**Remember**: Clear, descriptive issues get resolved faster! 🚀
