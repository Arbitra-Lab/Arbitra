# Quick Reference Guide

## 🚀 Quick Links

### Creating Issues

- **Bug**: Use [Bug Report](ISSUE_TEMPLATE/bug_report.md) template
- **Feature**: Use [Feature Request](ISSUE_TEMPLATE/feature_request.md) template
- **Docs**: Use [Documentation](ISSUE_TEMPLATE/documentation.md) template
- **Performance**: Use [Performance](ISSUE_TEMPLATE/performance.md) template
- **Security**: Email security@huston-housing.dev (don't create public issue!)
- **CI/CD**: Use [CI/CD Failure](ISSUE_TEMPLATE/ci_cd_failure.md) template

### Creating PRs

- Use [Pull Request Template](pull_request_template.md)
- Complete all checklist items
- Link related issues with `Closes #123`

### Documentation

- **Frontend**: [frontend/CONTRIBUTING.md](../frontend/CONTRIBUTING.md)
- **Backend**: [backend/CONTRIBUTING.md](../backend/CONTRIBUTING.md)
- **Contract**: [contract/CONTRIBUTING.md](../contract/CONTRIBUTING.md)
- **Security**: [SECURITY.md](../SECURITY.md)
- **Templates**: [TEMPLATES_GUIDE.md](TEMPLATES_GUIDE.md)

---

## 📋 Issue Templates at a Glance

| Template           | Use When              | Label           |
| ------------------ | --------------------- | --------------- |
| 🐛 Bug Report      | Something is broken   | `bug`           |
| ✨ Feature Request | Suggest new feature   | `enhancement`   |
| 📚 Documentation   | Docs need improvement | `documentation` |
| ⚡ Performance     | Performance problem   | `performance`   |
| 🔒 Security        | Found vulnerability   | `security`      |
| 🚨 CI/CD Failure   | Pipeline is failing   | `ci-cd`         |

---

## ✅ Before Submitting

### Before Creating an Issue

- [ ] Search for existing issues
- [ ] Use the appropriate template
- [ ] Fill in all sections
- [ ] Include reproduction steps (if bug)
- [ ] Add environment details
- [ ] Link related issues

### Before Creating a PR

- [ ] Run `make check` (frontend/backend)
- [ ] Run `cargo test --all` (contract)
- [ ] Complete the PR template
- [ ] Check all checklist items
- [ ] Link related issues
- [ ] Request reviewers

---

## 🏷️ Labels

```
bug              - Something is broken
enhancement      - New feature or improvement
documentation    - Documentation needed
performance      - Performance issue
security         - Security vulnerability
ci-cd            - Pipeline failure
good first issue - Good for new contributors
help wanted      - Need community help
blocked          - Blocked by another issue
priority-high    - High priority
priority-low     - Low priority
```

---

## 🔐 Security

**⚠️ NEVER create public security issues!**

**Report to**: security@huston-housing.dev

**Or use**: GitHub private vulnerability reporting

See [SECURITY.md](../SECURITY.md) for details.

---

## 📝 Title Format

```
[TYPE] Brief description

Examples:
[BUG] Login fails on mobile devices
[FEATURE] Add dark mode toggle
[DOCS] Add Windows setup guide
[PERF] API response time is 5s
[CI/CD] Backend build failing
```

---

## 🔗 Linking Issues

In PR description:

```
Closes #123          # Closes the issue
Related to #456      # Links without closing
Fixes #789           # Same as Closes
```

---

## 📊 Checklist Items

### Code Quality

- [ ] Code follows style guidelines
- [ ] No console errors or warnings
- [ ] TypeScript/Rust types are correct
- [ ] No unused variables or imports

### Testing

- [ ] All tests pass
- [ ] New tests added
- [ ] Edge cases tested
- [ ] Error scenarios tested

### Documentation

- [ ] README updated
- [ ] API docs updated
- [ ] Code comments added
- [ ] CONTRIBUTING.md updated

### Security

- [ ] No hardcoded secrets
- [ ] Input validation added
- [ ] Authorization checks in place
- [ ] No SQL injection vulnerabilities

---

## 🚀 Development Commands

### Frontend

```bash
cd frontend
make check          # Run all checks
make lint           # ESLint
make format         # Prettier
make test           # Tests
make build          # Build
```

### Backend

```bash
cd backend
make ci              # Full CI pipeline
make lint            # ESLint
make format-check    # Prettier
make typecheck       # TypeScript
make test            # Tests
make build           # Build
```

### Contract

```bash
cd contract
cargo build --release    # Build
cargo fmt --all          # Format
cargo clippy --all-targets --all-features -- -D warnings  # Lint
cargo test --all         # Tests
./check-all.sh           # All checks
```

---

## 📞 Getting Help

- **Questions**: GitHub Discussions
- **Security**: security@huston-housing.dev
- **Bugs**: Create issue with Bug Report template
- **Features**: Create issue with Feature Request template
- **Docs**: Create issue with Documentation template

---

## 🎯 Common Scenarios

### I found a bug

1. Search for existing issues
2. Create issue with [Bug Report](ISSUE_TEMPLATE/bug_report.md) template
3. Include reproduction steps
4. Add environment details

### I want to suggest a feature

1. Search for existing requests
2. Create issue with [Feature Request](ISSUE_TEMPLATE/feature_request.md) template
3. Describe the problem it solves
4. Provide acceptance criteria

### I found a security vulnerability

1. **DO NOT** create public issue
2. Email security@huston-housing.dev
3. Include: description, location, reproduction, impact, suggested fix
4. Wait for response before disclosing

### I want to contribute code

1. Read the appropriate CONTRIBUTING.md
2. Create a branch
3. Make changes
4. Run checks (`make check` or `cargo test`)
5. Create PR with template
6. Complete checklist
7. Request review

### The CI/CD pipeline is failing

1. Check the error logs
2. Create issue with [CI/CD Failure](ISSUE_TEMPLATE/ci_cd_failure.md) template
3. Include error messages
4. Describe reproduction steps
5. Suggest a fix

---

## 📚 Documentation Structure

```
.github/
├── ISSUE_TEMPLATE/          # Issue templates
├── pull_request_template.md # PR template
├── TEMPLATES_GUIDE.md       # Complete guide
└── QUICK_REFERENCE.md       # This file

Root/
├── SECURITY.md              # Security policy
├── CONTRIBUTING.md          # Main guide
├── frontend/CONTRIBUTING.md # Frontend guide
├── backend/CONTRIBUTING.md  # Backend guide
└── contract/CONTRIBUTING.md # Contract guide
```

---

## ✨ Pro Tips

1. **Search first** - Check if issue already exists
2. **Be specific** - More details = faster resolution
3. **Include logs** - Attach error messages and screenshots
4. **Link issues** - Show context and dependencies
5. **Follow templates** - Ensures all info is provided
6. **Complete checklists** - Don't skip items
7. **Respond to feedback** - Help reviewers help you
8. **Use clear titles** - Makes issues searchable

---

## 🔄 Issue Lifecycle

```
Created → Triaged → Assigned → In Progress → In Review → Closed
```

---

## 📊 Metrics

Track these to improve:

- Issue response time
- Issue resolution time
- PR review time
- PR merge rate
- Bug escape rate

---

**Remember**: Clear, descriptive issues and PRs get resolved faster! 🚀

For more details, see [TEMPLATES_GUIDE.md](TEMPLATES_GUIDE.md)
