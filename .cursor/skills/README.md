# Databuddy Agent Skills

Official agent skills for Databuddy analytics integration, optimized for AI coding agents.

## Available Skills

| Skill | Description | Version |
|-------|-------------|---------|
| `databuddy-sdk` | Core SDK integration for React/web apps | 2.0.0 |
| `databuddy-tracker` | Low-level tracker script for plain HTML | 1.0.0 |
| `databuddy-integration` | Full-stack integration examples | 1.0.0 |
| `databuddy-cache` | Redis caching layer for analytics queries | 1.0.0 |
| `databuddy-notifications` | Multi-channel notification system | 1.0.0 |

## Installation

### For AI Agents (Recommended)

```bash
npx add-skill databuddy-analytics/Databuddy/.cursor/skills
```

### Manual Installation

Clone this repository and copy the `.cursor/skills` folder to your project's root directory.

## Usage

AI agents will automatically detect and use these skills when working on Databuddy-related tasks:

- SDK integration and configuration
- Custom event tracking implementation
- Environment variable setup
- Framework-specific patterns (Next.js, Vite, TanStack Start)
- Performance optimization
- Error tracking setup

## Skill Structure

```
.cursor/skills/
├── SKILL.md              # Main skill file (databuddy-sdk)
├── references/
│   └── guide.md          # Additional reference documentation
└── scripts/              # Helper scripts (optional)
```

## Framework Support

| Framework | Env Variable | Example |
|-----------|--------------|---------|
| Next.js | `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` | ✅ Supported |
| Vite | `VITE_DATABUDDY_CLIENT_ID` | ✅ Supported |
| TanStack Start | `VITE_DATABUDDY_CLIENT_ID` | ✅ Supported |
| React (CRA) | `REACT_APP_DATABUDDY_CLIENT_ID` | ✅ Supported |
| Remix | `DATABUDDY_CLIENT_ID` | ✅ Supported |
| Plain HTML | `data-client-id` attribute | ✅ Supported |

## Documentation

- **Main Docs**: https://www.databuddy.cc/docs
- **Dashboard**: https://app.databuddy.cc
- **GitHub**: https://github.com/databuddy-analytics/Databuddy
- **Discord**: https://discord.gg/JTk7a38tCZ

## Contributing

See [CONTRIBUTING.md](https://github.com/databuddy-analytics/Databuddy/blob/main/CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](https://github.com/databuddy-analytics/Databuddy/blob/main/LICENSE) for details.
