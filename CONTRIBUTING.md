# 🤝 Contributing Guide

Thank you for your interest in contributing to Trading Platform! This document provides guidelines and instructions for contributing.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Commit Guidelines](#commit-guidelines)
- [Submitting Pull Requests](#submitting-pull-requests)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Enhancements](#suggesting-enhancements)

---

## Code of Conduct

### Our Pledge
We are committed to providing a welcoming and inspiring community for all. We pledge to act and interact in ways that contribute to an open, welcoming, diverse, inclusive, and healthy community.

### Expected Behavior
- Use welcoming and inclusive language
- Be respectful of differing opinions and experiences
- Accept constructive criticism gracefully
- Focus on what is best for the community
- Show empathy towards other community members

### Unacceptable Behavior
- Harassment, bullying, or discriminatory language
- Insults, derogatory comments, or personal attacks
- Publishing others' private information without consent
- Unwelcome sexual attention or advances
- Any other conduct that violates Mozilla's Community Participation Guidelines

---

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager
- Git installed
- GitHub account
- AlphaVantage API key (free from alphavantage.co)

### Fork & Clone
```bash
# Fork the repository on GitHub

# Clone your fork
git clone https://github.com/YOUR-USERNAME/trading-platform.git
cd trading-platform

# Add upstream remote
git remote add upstream https://github.com/ORIGINAL-OWNER/trading-platform.git
```

---

## Development Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Create Environment File
```bash
cp .env.example .env
```

Add your API key:
```
VITE_ALPHA_VANTAGE_API_KEY=your_api_key_here
```

### 3. Start Development Server
```bash
npm run dev
```

App runs at: http://localhost:3000

### 4. Verify Everything Works
```bash
# Build the app
npm run build

# Run tests (if available)
npm test

# Check for lint errors
npm run lint
```

---

## Making Changes

### Create a Feature Branch
```bash
git checkout -b feature/your-feature-name

# Examples:
# feature/add-dark-mode
# feature/improve-chart-rendering
# fix/resolve-rate-limit-issue
```

### Branch Naming Convention
- `feature/` - New features
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `perf/` - Performance improvements
- `test/` - Test additions

### Code Style
- Use ESLint rules from `.eslintrc`
- Follow existing code patterns
- Use meaningful variable names
- Add comments for complex logic
- Keep functions small and focused

### Add JSDoc Comments
```javascript
/**
 * Fetches real-time stock quote
 * @param {string} symbol - Stock symbol (e.g., 'AAPL')
 * @returns {Promise<Object>} Quote data with price, change, volume
 */
export async function getQuoteAlpha(symbol) {
  // implementation
}
```

---

## Commit Guidelines

### Commit Message Format
```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types
- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only
- **style**: Changes that don't affect code (formatting, etc.)
- **refactor**: Code change without feature change
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **chore**: Dependency updates, build changes

### Examples
```
feat(dashboard): add dark mode toggle

fix(analyzer): resolve chart rendering on mobile

docs: update API key setup instructions

perf(quotes): optimize batch quote fetching

refactor(helpers): consolidate formatting functions
```

### Good Commit Practices
- Write clear, descriptive messages
- Keep commits atomic (one feature per commit)
- Reference issues: `Fixes #123`
- Avoid force pushes to shared branches

---

## Submitting Pull Requests

### Before Submitting
```bash
# Update your branch with latest main
git fetch upstream
git rebase upstream/main

# Run linting
npm run lint

# Build to verify no errors
npm run build

# Test your changes thoroughly
npm run dev
```

### PR Title Format
```
[Type] Brief description of changes

Examples:
[Feature] Add real-time price alerts
[Fix] Resolve rate limiting issues on dashboard
[Docs] Update API documentation
```

### PR Description Template
```markdown
## Description
Brief description of what this PR does.

## Type of Change
- [ ] New feature
- [ ] Bug fix
- [ ] Documentation update
- [ ] Performance improvement
- [ ] Code refactor

## Related Issues
Fixes #(issue number)

## Changes Made
- Change 1
- Change 2
- Change 3

## Testing Done
- [ ] Tested locally with `npm run dev`
- [ ] Verified build: `npm run build`
- [ ] Tested on different browsers
- [ ] Tested on mobile (if applicable)

## Screenshots (if applicable)
[Add screenshots or GIFs of changes]

## Checklist
- [ ] Code follows project style guidelines
- [ ] Comments added for complex logic
- [ ] Documentation updated
- [ ] No console errors or warnings
- [ ] Tested on modern browsers
- [ ] API keys not committed
```

### PR Review Process
1. Submit PR from your feature branch
2. Describe changes clearly in PR description
3. Wait for code review from maintainers
4. Address feedback and push updates
5. After approval, maintainers will merge

---

## Reporting Bugs

### Before Reporting
- Check existing issues
- Test with latest code
- Gather system information
- Test with minimal reproduction

### Bug Report Template
Use GitHub Issues with this template:

```markdown
## Description
Brief description of the bug.

## Steps to Reproduce
1. Step 1
2. Step 2
3. Step 3

## Expected Behavior
What should happen.

## Actual Behavior
What actually happens.

## Environment
- OS: [e.g., Windows 10, macOS Big Sur]
- Node.js version: [e.g., 18.0.0]
- Browser: [e.g., Chrome 100]
- AlphaVantage API: [Free/Paid tier]

## Screenshots
[If applicable, add screenshots]

## Console Errors
[Paste any error messages from F12 console]

## Additional Context
[Any other relevant information]
```

---

## Suggesting Enhancements

### Enhancement Suggestions
We welcome feature requests! Use GitHub Issues with this template:

```markdown
## Description
Clear description of the suggested enhancement.

## Problem Statement
What problem does this solve? What's the use case?

## Proposed Solution
How you think this feature should work.

## Alternatives Considered
Other ways to solve this problem.

## Examples
Examples of other tools doing this.

## Additional Context
Any other information relevant to your proposal.
```

---

## Documentation

### Updating Docs
- Keep README.md current with features
- Update API documentation if adding/changing APIs
- Document new environment variables
- Update deployment guides if changing dependencies

### Doc File Locations
- User guides: `/docs`
- API docs: `/docs/api`
- Setup guides: Use markdown files in root
- Code comments: Use JSDoc in source files

---

## Project Structure

```
trading-platform/
├── src/
│   ├── api/              # API wrappers (AlphaVantage, Yahoo, etc.)
│   ├── components/       # React components
│   ├── styles/          # CSS files
│   ├── utils/           # Helper functions
│   ├── App.jsx          # Main app component
│   └── main.jsx         # Entry point
├── docs/                # Documentation files
├── public/              # Static files
├── .env.example         # Environment variables template
├── package.json         # Dependencies
├── vite.config.js       # Vite configuration
├── LICENSE              # MIT License
├── README.md            # Main documentation
└── CONTRIBUTING.md      # This file
```

---

## Testing

### Running Tests
```bash
npm test
```

### Test Coverage
When adding features, include tests:
```javascript
describe('getQuoteAlpha', () => {
  it('should fetch real quote data', async () => {
    const quote = await getQuoteAlpha('AAPL')
    expect(quote.price).toBeDefined()
    expect(quote.price).toBeGreaterThan(0)
  })
})
```

---

## Performance Guidelines

- Avoid unnecessary re-renders
- Use caching wisely (1-min TTL for API responses)
- Optimize bundle size
- Profile with DevTools before optimizing
- Document performance changes

---

## Security Guidelines

⚠️ **Critical Security Rules:**

1. **Never commit API keys**
   ```bash
   # Add to .gitignore
   .env
   .env.local
   ```

2. **Use environment variables**
   ```javascript
   const API_KEY = import.meta.env.VITE_API_KEY
   ```

3. **Validate user input**
   ```javascript
   // Don't: Direct user input in API calls
   const data = await fetch(userInput)
   
   // Do: Validate and sanitize
   const symbol = input.trim().toUpperCase().replace(/[^A-Z0-9^.]/g, '')
   ```

4. **Check for sensitive data**
   ```bash
   # Before commit
   git diff --staged | grep -i "password\|token\|key"
   ```

---

## Questions?

- 📖 Check the [README](README.md)
- 🔍 Search [existing issues](../../issues)
- 💬 Start a [discussion](../../discussions)
- 📧 Contact maintainers

---

## Recognition

Contributors will be recognized in:
- CONTRIBUTORS.md file
- Release notes for major contributions
- GitHub contributors graph

Thank you for contributing! 🙏

---

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Happy contributing! 🎉**

